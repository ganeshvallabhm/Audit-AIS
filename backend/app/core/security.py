import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import get_settings

# OWASP Password Storage Cheat Sheet minimum Argon2id posture (64 MiB, t=3, p=4)
password_hasher = PasswordHash(
    (
        Argon2Hasher(
            time_cost=3,
            memory_cost=65536,
            parallelism=4,
        ),
    )
)


def hash_password(plain_password: str) -> str:
    return password_hasher.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    return password_hasher.verify(plain_password, hashed_password)


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_access_token(
    *,
    user_id: UUID,
    company_id: UUID,
    role: str,
    token_version: int,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload = {
        "sub": str(user_id),
        "cid": str(company_id),
        "role": role,
        "ver": token_version,
        "type": "access",
        "jti": str(uuid4()),
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(
    *,
    user_id: UUID,
    company_id: UUID,
    token_version: int,
    session_id: UUID | None = None,
    token_family: UUID | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(days=settings.refresh_token_expire_days))
    payload = {
        "sub": str(user_id),
        "cid": str(company_id),
        "ver": token_version,
        "type": "refresh",
        "jti": str(session_id or uuid4()),
        "fam": str(token_family or uuid4()),
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["sub", "cid", "ver", "type", "exp"]},
    )
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Unexpected token type")
    return payload


def compute_sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compute_event_sha256(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def build_audit_history_payload(
    *,
    company_id: UUID,
    actor_user_id: UUID | None,
    category: str,
    module: str,
    entity_type: str,
    entity_id: UUID,
    entity_ref: str,
    action: str,
    changes: dict[str, Any] | None,
    prev_event_sha256: str | None,
) -> dict[str, Any]:
    return {
        "company_id": str(company_id),
        "actor_user_id": str(actor_user_id) if actor_user_id else None,
        "category": category,
        "module": module,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "entity_ref": entity_ref,
        "action": action,
        "changes": changes or {},
        "prev_event_sha256": prev_event_sha256,
    }
