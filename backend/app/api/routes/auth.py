from datetime import datetime, UTC
from uuid import UUID

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.core import Department, User
from app.schemas.auth import (
    LoginRequest,
    RegisterUserRequest,
    TokenResponse,
    UserSummary,
    UserUpdateRequest,
)
from app.schemas.common import MessageResponse
from app.services.audit_history import record_audit_history
from app.services.scoring import compute_initials

router = APIRouter(prefix="/auth", tags=["Authentication & Users"])

REFRESH_COOKIE_NAME = "companyaudit_refresh"


def serialize_user(db: Session, user: User) -> UserSummary:
    dept_name = None
    if user.department_id:
        dept_name = db.scalar(select(Department.name).where(Department.id == user.department_id))
    return UserSummary(
        id=user.id,
        company_id=user.company_id,
        department_id=user.department_id,
        department_name=dept_name,
        email=user.email,
        full_name=user.full_name,
        initials=compute_initials(user.full_name),
        job_title=user.job_title,
        role=user.role,  # type: ignore[arg-type]
        certifications=list(user.certifications or []),
        is_active=user.is_active,
        last_login_at=user.last_login_at,
    )


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.refresh_token_expire_days * 86400,
        path="/",
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    settings = get_settings()
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.strip().lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact your organization Administrator.",
        )

    user.last_login_at = datetime.now(UTC)
    access_token = create_access_token(
        user_id=user.id,
        company_id=user.company_id,
        role=user.role,
        token_version=user.token_version,
    )
    refresh_token = create_refresh_token(
        user_id=user.id,
        company_id=user.company_id,
        token_version=user.token_version,
    )
    _set_refresh_cookie(response, refresh_token)

    record_audit_history(
        db,
        company_id=user.company_id,
        actor=user,
        category="Auth",
        module="Authentication",
        entity_type="User",
        entity_id=user.id,
        entity_ref=user.email,
        action="Authenticated and established JWT session",
        changes={"role": user.role},
        request=request,
    )
    db.commit()
    db.refresh(user)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=serialize_user(db, user),
    )


@router.post("/register", response_model=UserSummary, status_code=status.HTTP_201_CREATED)
def register_user(
    payload: RegisterUserRequest,
    request: Request,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
) -> UserSummary:
    existing = db.scalar(
        select(User).where(
            User.company_id == current_user.company_id,
            func.lower(User.email) == payload.email.strip().lower(),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists in your organization.",
        )

    if payload.department_id is not None:
        dept = db.get(Department, payload.department_id)
        if dept is None or dept.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Referenced department not found in your organization.",
            )

    new_user = User(
        company_id=current_user.company_id,
        department_id=payload.department_id,
        email=payload.email.strip().lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        job_title=payload.job_title,
        role=payload.role,
        certifications=payload.certifications,
        is_active=True,
    )
    db.add(new_user)
    db.flush()

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Auth",
        module="User Management",
        entity_type="User",
        entity_id=new_user.id,
        entity_ref=new_user.email,
        action=f"Provisioned user account with role '{new_user.role}'",
        changes={"role": new_user.role, "department_id": str(new_user.department_id) if new_user.department_id else None},
        request=request,
    )
    db.commit()
    db.refresh(new_user)
    return serialize_user(db, new_user)


@router.get("/me", response_model=UserSummary)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserSummary:
    return serialize_user(db, current_user)


@router.post("/refresh", response_model=TokenResponse)
def refresh_session(
    response: Response,
    companyaudit_refresh: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> TokenResponse:
    if not companyaudit_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token cookie is missing.",
        )

    try:
        payload = decode_token(companyaudit_refresh, expected_type="refresh")
        user_id = UUID(payload["sub"])
        company_id = UUID(payload["cid"])
        token_ver = int(payload["ver"])
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        ) from None

    user = db.get(User, user_id)
    if (
        user is None
        or not user.is_active
        or user.company_id != company_id
        or user.token_version != token_ver
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session revoked or user disabled.",
        )

    settings = get_settings()
    access_token = create_access_token(
        user_id=user.id,
        company_id=user.company_id,
        role=user.role,
        token_version=user.token_version,
    )
    new_refresh = create_refresh_token(
        user_id=user.id,
        company_id=user.company_id,
        token_version=user.token_version,
    )
    _set_refresh_cookie(response, new_refresh)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=serialize_user(db, user),
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    current_user.token_version += 1
    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Auth",
        module="Authentication",
        entity_type="User",
        entity_id=current_user.id,
        entity_ref=current_user.email,
        action="Revoked session tokens and signed out",
        request=request,
    )
    db.commit()
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")
    return MessageResponse(detail="Successfully signed out.")


@router.get("/users", response_model=list[UserSummary])
def list_company_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserSummary]:
    users = db.scalars(
        select(User).where(User.company_id == current_user.company_id).order_by(User.full_name)
    ).all()
    return [serialize_user(db, u) for u in users]


@router.put("/users/{user_id}", response_model=UserSummary)
def update_user(
    user_id: UUID,
    payload: UserUpdateRequest,
    request: Request,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
) -> UserSummary:
    target = db.get(User, user_id)
    if target is None or target.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    changes = {}
    if payload.full_name is not None:
        target.full_name = payload.full_name.strip()
        changes["full_name"] = target.full_name
    if payload.job_title is not None:
        target.job_title = payload.job_title
        changes["job_title"] = target.job_title
    if payload.role is not None:
        target.role = payload.role
        changes["role"] = payload.role
    if payload.department_id is not None:
        dept = db.get(Department, payload.department_id)
        if dept is None or dept.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")
        target.department_id = payload.department_id
        changes["department_id"] = str(payload.department_id)
    if payload.is_active is not None:
        target.is_active = payload.is_active
        if not payload.is_active:
            target.token_version += 1
        changes["is_active"] = payload.is_active
    if payload.certifications is not None:
        target.certifications = payload.certifications

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="User Management",
        entity_type="User",
        entity_id=target.id,
        entity_ref=target.email,
        action="Updated user role or organization attributes",
        changes=changes,
        request=request,
    )
    db.commit()
    db.refresh(target)
    return serialize_user(db, target)

