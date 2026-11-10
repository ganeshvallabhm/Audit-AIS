from collections.abc import Callable
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.core import User

bearer_scheme = HTTPBearer(auto_error=False)

VALID_ROLES = ("Admin", "Auditor", "Department Head", "Management", "Viewer")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(credentials.credentials, expected_type="access")
        user_id = UUID(payload["sub"])
        company_id = UUID(payload["cid"])
        token_ver = int(payload["ver"])
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, user_id)
    if (
        user is None
        or not user.is_active
        or user.company_id != company_id
        or user.token_version != token_ver
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive or session has been revoked.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_roles(*allowed_roles: str) -> Callable[[User], User]:
    allowed_set = set(allowed_roles)

    def _guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' is not authorized to perform this operation.",
            )
        return current_user

    return _guard


def ensure_department_scope(user: User, target_department_id: UUID | None) -> None:
    """Enforces row-level isolation for Department Head mutations."""
    if user.role == "Department Head":
        if user.department_id is None or user.department_id != target_department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Department Heads can only modify records belonging to their assigned department.",
            )

