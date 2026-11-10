from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import Request
from sqlalchemy import exists, select
from sqlalchemy.orm import Session, aliased

from app.core.security import build_audit_history_payload, compute_event_sha256
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


def _get_latest_chain_hash(db: Session, company_id: UUID) -> str | None:
    pending = [
        obj
        for obj in db.new
        if isinstance(obj, AuditHistory) and obj.company_id == company_id and obj.event_sha256
    ]
    if pending:
        return pending[-1].event_sha256

    ah_child = aliased(AuditHistory)
    tip_hash = db.scalar(
        select(AuditHistory.event_sha256)
        .where(
            AuditHistory.company_id == company_id,
            ~exists(
                select(ah_child.id).where(
                    ah_child.company_id == company_id,
                    ah_child.prev_event_sha256 == AuditHistory.event_sha256,
                )
            ),
        )
        .order_by(AuditHistory.created_at.desc())
        .limit(1)
    )
    if tip_hash:
        return tip_hash

    return db.scalar(
        select(AuditHistory.event_sha256)
        .where(AuditHistory.company_id == company_id)
        .order_by(AuditHistory.created_at.desc())
        .limit(1)
    )


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
    created_at_override: datetime | None = None,
) -> AuditHistory:
    actor_label = actor_label_override or (actor.full_name if actor else "System Engine")
    actor_role = actor_role_override or (actor.job_title or actor.role if actor else "Automated Governance")
    prev_hash = _get_latest_chain_hash(db, company_id)
    payload = build_audit_history_payload(
        company_id=company_id,
        actor_user_id=actor.id if actor else None,
        category=category,
        module=module,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_ref=entity_ref,
        action=action,
        changes=changes,
        prev_event_sha256=prev_hash,
    )
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
        prev_event_sha256=prev_hash,
        event_sha256=compute_event_sha256(payload),
    )
    if created_at_override is not None:
        entry.created_at = created_at_override
    db.add(entry)
    return entry


def verify_company_history_chain(db: Session, company_id: UUID) -> dict[str, Any]:
    rows = list(
        db.scalars(
            select(AuditHistory)
            .where(AuditHistory.company_id == company_id)
            .order_by(AuditHistory.created_at.asc(), AuditHistory.id.asc())
        ).all()
    )
    verified_at = datetime.now(UTC)
    total = len(rows)
    if total == 0:
        return {
            "valid": True,
            "total_events": 0,
            "checked_events": 0,
            "broken_event_ids": [],
            "genesis_ok": True,
            "latest_event_sha256": None,
            "verified_at": verified_at,
            "verification_note": "Audit trail contains 0 recorded events.",
        }

    broken_ids: list[UUID] = []
    by_prev: dict[str | None, list[AuditHistory]] = {}
    for row in rows:
        expected_payload = build_audit_history_payload(
            company_id=row.company_id,
            actor_user_id=row.actor_user_id,
            category=row.category,
            module=row.module,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            entity_ref=row.entity_ref,
            action=row.action,
            changes=row.changes_json,
            prev_event_sha256=row.prev_event_sha256,
        )
        expected_sha = compute_event_sha256(expected_payload)
        if expected_sha != row.event_sha256:
            broken_ids.append(row.id)
        by_prev.setdefault(row.prev_event_sha256, []).append(row)

    genesis_rows = by_prev.get(None, [])
    genesis_ok = len(genesis_rows) == 1

    walked = 0
    latest_sha: str | None = None
    if genesis_ok:
        seen: set[UUID] = set()
        curr: AuditHistory | None = genesis_rows[0]
        while curr is not None and curr.id not in seen:
            seen.add(curr.id)
            walked += 1
            latest_sha = curr.event_sha256
            children = by_prev.get(curr.event_sha256, [])
            if len(children) > 1:
                broken_ids.extend(c.id for c in children)
                break
            curr = children[0] if children else None

        if walked != total:
            for row in rows:
                if row.id not in seen and row.id not in broken_ids:
                    broken_ids.append(row.id)
    else:
        for row in genesis_rows:
            if row.id not in broken_ids:
                broken_ids.append(row.id)
        if not genesis_rows and rows:
            broken_ids.append(rows[0].id)

    dedup_broken = list(dict.fromkeys(broken_ids))
    is_valid = genesis_ok and walked == total and len(dedup_broken) == 0
    note = (
        f"Verified {walked}/{total} cryptographically linked SHA-256 audit events sequentially from genesis."
        if is_valid
        else f"Hash chain verification detected {len(dedup_broken)} inconsistent or unlinked event(s) out of {total}."
    )
    return {
        "valid": is_valid,
        "total_events": total,
        "checked_events": walked,
        "broken_event_ids": dedup_broken,
        "genesis_ok": genesis_ok,
        "latest_event_sha256": latest_sha or rows[-1].event_sha256,
        "verified_at": verified_at,
        "verification_note": note,
    }
