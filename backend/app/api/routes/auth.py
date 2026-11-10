from datetime import UTC, datetime, timedelta
import secrets
from urllib.parse import urlparse
from uuid import UUID, uuid4

import jwt
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.rate_limit import client_rate_key, rate_limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_csrf_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.core import Department, RefreshSession, User
from app.schemas.auth import (
    AdminResetPasswordRequest,
    LoginRequest,
    RegisterUserRequest,
    TokenResponse,
    UserSummary,
    UserUpdateRequest,
)
from app.schemas.common import MessageResponse
from app.services.audit_history import extract_client_ip, record_audit_history
from app.services.scoring import compute_initials

router = APIRouter(prefix="/auth", tags=["Authentication & Users"])

REFRESH_COOKIE_NAME = "companyaudit_refresh"
CSRF_COOKIE_NAME = "companyaudit_csrf"


def serialize_users(db: Session, users: list[User]) -> list[UserSummary]:
    dept_ids = {u.department_id for u in users if u.department_id is not None}
    dept_names: dict[UUID, str] = {}
    if dept_ids:
        for d_id, d_name in db.execute(
            select(Department.id, Department.name).where(Department.id.in_(dept_ids))
        ).all():
            dept_names[d_id] = d_name

    return [
        UserSummary(
            id=u.id,
            company_id=u.company_id,
            department_id=u.department_id,
            department_name=dept_names.get(u.department_id) if u.department_id else None,
            email=u.email,
            full_name=u.full_name,
            initials=compute_initials(u.full_name),
            job_title=u.job_title,
            role=u.role,  # type: ignore[arg-type]
            certifications=list(u.certifications or []),
            is_active=u.is_active,
            last_login_at=u.last_login_at,
        )
        for u in users
    ]


def serialize_user(db: Session, user: User) -> UserSummary:
    return serialize_users(db, [user])[0]


def _set_auth_cookies(response: Response, refresh_token: str, csrf_token: str) -> None:
    settings = get_settings()
    max_age = settings.refresh_token_expire_days * 86400
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=max_age,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=max_age,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")
    response.delete_cookie(key=CSRF_COOKIE_NAME, path="/")


def _validate_origin_and_csrf(
    request: Request,
    csrf_cookie: str | None,
    csrf_header: str | None,
    *,
    require_csrf: bool = True,
) -> None:
    settings = get_settings()
    origin = request.headers.get("origin")
    if origin:
        allowed = set(settings.cors_origin_list)
        if origin not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Untrusted request origin.",
            )
    else:
        referer = request.headers.get("referer")
        if referer:
            parsed = urlparse(referer)
            ref_origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
            if ref_origin and ref_origin not in set(settings.cors_origin_list):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Untrusted request referer.",
                )

    if require_csrf:
        if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or missing CSRF verification token.",
            )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    settings = get_settings()
    normalized_email = payload.email.strip().lower()
    rate_limiter.check(client_rate_key(request, "auth_login_ip"), max_requests=40, window_seconds=60)

    user = db.scalar(select(User).where(func.lower(User.email) == normalized_email))
    if user is None or not verify_password(payload.password, user.password_hash):
        rate_limiter.check(
            client_rate_key(request, "auth_login_fail", normalized_email),
            max_requests=8,
            window_seconds=60,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact your organization Administrator.",
        )

    rate_limiter.reset(client_rate_key(request, "auth_login_fail", normalized_email))

    user.last_login_at = datetime.now(UTC)
    session_id = uuid4()
    token_family = uuid4()
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
        session_id=session_id,
        token_family=token_family,
    )
    refresh_sess = RefreshSession(
        id=session_id,
        company_id=user.company_id,
        user_id=user.id,
        token_family=token_family,
        token_hash=hash_token(refresh_token),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
        ip_address=extract_client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:255] or None,
    )
    db.add(refresh_sess)

    csrf_token = generate_csrf_token()
    _set_auth_cookies(response, refresh_token, csrf_token)

    record_audit_history(
        db,
        company_id=user.company_id,
        actor=user,
        category="Auth",
        module="Authentication",
        entity_type="User",
        entity_id=user.id,
        entity_ref=user.email,
        action="Authenticated and established DB-tracked JWT session",
        changes={"role": user.role, "token_family": str(token_family)},
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
    request: Request,
    response: Response,
    companyaudit_refresh: str | None = Cookie(default=None),
    companyaudit_csrf: str | None = Cookie(default=None),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
    db: Session = Depends(get_db),
) -> TokenResponse:
    rate_limiter.check(client_rate_key(request, "auth_refresh"), max_requests=40, window_seconds=60)
    _validate_origin_and_csrf(request, companyaudit_csrf, x_csrf_token, require_csrf=True)

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

    now = datetime.now(UTC)
    token_digest = hash_token(companyaudit_refresh)
    sess = db.scalar(select(RefreshSession).where(RefreshSession.token_hash == token_digest))
    user = db.get(User, user_id)

    # Detect reuse of a previously rotated or revoked refresh token
    if sess is not None and sess.revoked_at is not None:
        db.execute(
            update(RefreshSession)
            .where(RefreshSession.token_family == sess.token_family, RefreshSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        if user is not None:
            user.token_version += 1
            record_audit_history(
                db,
                company_id=user.company_id,
                actor=user,
                category="Auth",
                module="Authentication",
                entity_type="User",
                entity_id=user.id,
                entity_ref=user.email,
                action="Detected refresh token reuse; revoked full session family",
                changes={"token_family": str(sess.token_family), "revoked_session_id": str(sess.id)},
                request=request,
            )
        db.commit()
        _clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token reuse detected. Session family revoked.",
        )

    if (
        sess is None
        or sess.expires_at < now
        or user is None
        or not user.is_active
        or user.company_id != company_id
        or user.token_version != token_ver
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session revoked or expired.",
        )

    settings = get_settings()
    new_session_id = uuid4()
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
        session_id=new_session_id,
        token_family=sess.token_family,
    )
    new_sess = RefreshSession(
        id=new_session_id,
        company_id=user.company_id,
        user_id=user.id,
        token_family=sess.token_family,
        token_hash=hash_token(new_refresh),
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
        ip_address=extract_client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:255] or None,
    )
    db.add(new_sess)
    db.flush()

    sess.revoked_at = now
    sess.replaced_by_id = new_sess.id
    db.commit()

    csrf_token = generate_csrf_token()
    _set_auth_cookies(response, new_refresh, csrf_token)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=serialize_user(db, user),
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    companyaudit_csrf: str | None = Cookie(default=None),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if companyaudit_csrf is not None:
        _validate_origin_and_csrf(request, companyaudit_csrf, x_csrf_token, require_csrf=True)

    now = datetime.now(UTC)
    db.execute(
        update(RefreshSession)
        .where(
            RefreshSession.company_id == current_user.company_id,
            RefreshSession.user_id == current_user.id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
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
        action="Revoked DB refresh sessions and signed out",
        request=request,
    )
    db.commit()
    _clear_auth_cookies(response)
    return MessageResponse(detail="Successfully signed out.")


@router.get("/users", response_model=list[UserSummary])
def list_company_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserSummary]:
    users = list(
        db.scalars(
            select(User).where(User.company_id == current_user.company_id).order_by(User.full_name)
        ).all()
    )
    return serialize_users(db, users)


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
    if "department_id" in payload.model_fields_set:
        if payload.department_id is not None:
            dept = db.get(Department, payload.department_id)
            if dept is None or dept.company_id != current_user.company_id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")
        target.department_id = payload.department_id
        changes["department_id"] = str(payload.department_id) if payload.department_id else None
    if payload.is_active is not None:
        target.is_active = payload.is_active
        if not payload.is_active:
            target.token_version += 1
            db.execute(
                update(RefreshSession)
                .where(RefreshSession.user_id == target.id, RefreshSession.revoked_at.is_(None))
                .values(revoked_at=datetime.now(UTC))
            )
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


@router.post("/users/{user_id}/reset-password", response_model=MessageResponse)
def admin_reset_password(
    user_id: UUID,
    payload: AdminResetPasswordRequest,
    request: Request,
    current_user: User = Depends(require_roles("Admin")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    target = db.get(User, user_id)
    if target is None or target.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    now = datetime.now(UTC)
    target.password_hash = hash_password(payload.new_password)
    target.token_version += 1
    db.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == target.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Auth",
        module="User Management",
        entity_type="User",
        entity_id=target.id,
        entity_ref=target.email,
        action="Administrator reset user password and invalidated active sessions",
        request=request,
    )
    db.commit()
    return MessageResponse(detail=f"Password updated and active sessions revoked for {target.email}.")
