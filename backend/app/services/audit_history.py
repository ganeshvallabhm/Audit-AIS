from typing import Any
from uuid import UUID

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.security import compute_event_sha256
from app.models.core import User
from app.models.telemetry import AuditHistory


def extract_client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    if request.client:
        return request.client.host[:45]
    return None


def record_audit_history(
    db: Session,
    *,
    company_id: UUID,
    actor: User | None,
    category: str,
    module: str,
    entity_type: str,
    entity_id: UUID,
    entity_ref: str,
    action: str,
    changes: dict[str, Any] | None = None,
    request: Request | None = None,
    actor_label_override: str | None = None,
    actor_role_override: str | None = None,
) -> AuditHistory:
    actor_label = actor_label_override or (actor.full_name if actor else "System Engine")
    actor_role = actor_role_override or (actor.job_title or actor.role if actor else "Automated Governance")
    payload = {
        "company_id": str(company_id),
        "actor_user_id": str(actor.id) if actor else None,
        "category": category,
        "module": module,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "entity_ref": entity_ref,
        "action": action,
        "changes": changes or {},
    }
    entry = AuditHistory(
        company_id=company_id,
        actor_user_id=actor.id if actor else None,
        actor_label=actor_label,
        actor_role=actor_role,
        category=category,
        module=module,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_ref=entity_ref,
        action=action,
        changes_json=changes or {},
        ip_address=extract_client_ip(request),
        event_sha256=compute_event_sha256(payload),
    )
    db.add(entry)
    return entry

