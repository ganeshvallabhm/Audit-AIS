from datetime import UTC, datetime
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import ensure_department_scope, get_current_user, require_roles
from app.core.rate_limit import client_rate_key, rate_limiter
from app.models.audit import Audit, ChecklistItem
from app.models.core import Company, Department, User
from app.models.governance import CorrectiveAction, Evidence, Finding
from app.models.telemetry import AuditHistory
from app.schemas.common import PaginatedResponse
from app.schemas.dashboard import AuditHistoryOut
from app.schemas.governance import EvidenceOut, EvidenceUpdate, EvidenceVerifyRequest
from app.services.audit_history import record_audit_history
from app.services.evidence_storage import store_uploaded_evidence, verify_stored_file_sha256
from app.services.scoring import generate_next_code

router = APIRouter(prefix="/evidence", tags=["Evidence Vault"])


def serialize_evidence_list(db: Session, rows: list[Evidence]) -> list[EvidenceOut]:
    if not rows:
        return []

    audit_ids = {e.audit_id for e in rows if e.audit_id is not None}
    finding_ids = {e.finding_id for e in rows if e.finding_id is not None}
    user_ids = {
        uid
        for e in rows
        for uid in (e.uploaded_by_user_id, e.reviewed_by_user_id)
        if uid is not None
    }

    audit_map: dict[UUID, Audit] = (
        {a.id: a for a in db.scalars(select(Audit).where(Audit.id.in_(audit_ids))).all()}
        if audit_ids
        else {}
    )
    finding_map: dict[UUID, Finding] = (
        {f.id: f for f in db.scalars(select(Finding).where(Finding.id.in_(finding_ids))).all()}
        if finding_ids
        else {}
    )
    dept_ids = {
        *{a.department_id for a in audit_map.values()},
        *{f.department_id for f in finding_map.values()},
    }
    dept_map: dict[UUID, str] = (
        {
            d_id: d_name
            for d_id, d_name in db.execute(
                select(Department.id, Department.name).where(Department.id.in_(dept_ids))
            ).all()
        }
        if dept_ids
        else {}
    )
    user_map: dict[UUID, str] = (
        {
            u_id: u_name
            for u_id, u_name in db.execute(
                select(User.id, User.full_name).where(User.id.in_(user_ids))
            ).all()
        }
        if user_ids
        else {}
    )

    output: list[EvidenceOut] = []
    for ev in rows:
        audit = audit_map.get(ev.audit_id) if ev.audit_id else None
        finding = finding_map.get(ev.finding_id) if ev.finding_id else None
        dept_name = None
        if audit:
            dept_name = dept_map.get(audit.department_id)
        if dept_name is None and finding:
            dept_name = dept_map.get(finding.department_id)

        output.append(
            EvidenceOut(
                id=ev.id,
                company_id=ev.company_id,
                audit_id=ev.audit_id,
                audit_code=audit.code if audit else None,
                department_name=dept_name,
                finding_id=ev.finding_id,
                finding_code=finding.code if finding else None,
                corrective_action_id=ev.corrective_action_id,
                checklist_item_id=ev.checklist_item_id,
                uploaded_by_user_id=ev.uploaded_by_user_id,
                uploaded_by_name=user_map.get(ev.uploaded_by_user_id, "System"),
                reviewed_by_user_id=ev.reviewed_by_user_id,
                reviewed_by_name=user_map.get(ev.reviewed_by_user_id) if ev.reviewed_by_user_id else None,
                code=ev.code,
                original_filename=ev.original_filename,
                mime_type=ev.mime_type,
                byte_size=ev.byte_size,
                sha256_hash=ev.sha256_hash,
                verification_status=ev.verification_status,  # type: ignore[arg-type]
                tag=ev.tag,
                reviewed_at=ev.reviewed_at,
                created_at=ev.created_at,
                updated_at=ev.updated_at,
            )
        )
    return output


def serialize_evidence(db: Session, ev: Evidence) -> EvidenceOut:
    return serialize_evidence_list(db, [ev])[0]


@router.get("", response_model=PaginatedResponse[EvidenceOut])
def list_evidence(
    audit_id: UUID | None = Query(default=None),
    finding_id: UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[EvidenceOut]:
    stmt = select(Evidence).where(Evidence.company_id == current_user.company_id)
    if audit_id:
        stmt = stmt.where(Evidence.audit_id == audit_id)
    if finding_id:
        stmt = stmt.where(Evidence.finding_id == finding_id)
    if status_filter:
        stmt = stmt.where(Evidence.verification_status == status_filter)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Evidence.code.ilike(pattern),
                Evidence.original_filename.ilike(pattern),
                Evidence.tag.ilike(pattern),
                Evidence.sha256_hash.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.scalars(stmt.order_by(Evidence.created_at.desc()).offset(offset).limit(limit)).all())
    return PaginatedResponse(
        items=serialize_evidence_list(db, rows),
        total=int(total),
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=EvidenceOut, status_code=status.HTTP_201_CREATED)
async def upload_evidence(
    request: Request,
    file: UploadFile = File(...),
    audit_id: UUID | None = Form(default=None),
    finding_id: UUID | None = Form(default=None),
    corrective_action_id: UUID | None = Form(default=None),
    checklist_item_id: UUID | None = Form(default=None),
    tag: str | None = Form(default=None),
    current_user: User = Depends(require_roles("Admin", "Auditor", "Department Head")),
    db: Session = Depends(get_db),
) -> EvidenceOut:
    rate_limiter.check(client_rate_key(request, "evidence_upload"), max_requests=25, window_seconds=60)

    target_dept_id: UUID | None = None
    if audit_id:
        audit = db.get(Audit, audit_id)
        if audit is None or audit.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit not found.")
        target_dept_id = audit.department_id

    if finding_id:
        finding = db.get(Finding, finding_id)
        if finding is None or finding.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")
        if target_dept_id is None:
            target_dept_id = finding.department_id

    if corrective_action_id:
        act = db.get(CorrectiveAction, corrective_action_id)
        if act is None or act.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrective action not found.")

    if checklist_item_id:
        ci = db.get(ChecklistItem, checklist_item_id)
        if ci is None or ci.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found.")

    if current_user.role == "Department Head" and target_dept_id is not None:
        ensure_department_scope(current_user, target_dept_id)

    safe_name, storage_key, mime_type, byte_size, sha256_hex = await store_uploaded_evidence(
        file, current_user.company_id
    )

    ev_code = generate_next_code(db, Evidence, current_user.company_id, "EVD-", 4101)

    ev = Evidence(
        company_id=current_user.company_id,
        audit_id=audit_id,
        finding_id=finding_id,
        corrective_action_id=corrective_action_id,
        checklist_item_id=checklist_item_id,
        uploaded_by_user_id=current_user.id,
        code=ev_code,
        original_filename=safe_name,
        storage_key=storage_key,
        mime_type=mime_type,
        byte_size=byte_size,
        sha256_hash=sha256_hex,
        verification_status="Pending Review",
        tag=tag,
    )
    db.add(ev)
    db.flush()

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Evidence",
        module="Evidence Management",
        entity_type="Evidence",
        entity_id=ev.id,
        entity_ref=ev.code,
        action=f"Uploaded SHA-256 verified artifact '{safe_name}' ({byte_size} bytes)",
        changes={"sha256_hash": sha256_hex, "mime_type": mime_type},
        request=request,
    )
    db.commit()
    db.refresh(ev)
    return serialize_evidence(db, ev)


@router.get("/{evidence_id}/download")
def download_evidence(
    evidence_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    ev = db.get(Evidence, evidence_id)
    if ev is None or ev.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence artifact not found.")

    valid, path = verify_stored_file_sha256(ev.storage_key, ev.sha256_hash)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence file missing from storage vault.")
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Evidence checksum mismatch detected! File integrity check failed.",
        )

    return FileResponse(
        path=path,
        media_type=ev.mime_type,
        filename=ev.original_filename,
        headers={"X-Content-Type-Options": "nosniff", "X-Evidence-SHA256": ev.sha256_hash},
    )


@router.put("/{evidence_id}/verify", response_model=EvidenceOut)
def verify_evidence(
    evidence_id: UUID,
    payload: EvidenceVerifyRequest,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor")),
    db: Session = Depends(get_db),
) -> EvidenceOut:
    ev = db.get(Evidence, evidence_id)
    if ev is None or ev.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence artifact not found.")

    if payload.verify_file_checksum:
        valid, _ = verify_stored_file_sha256(ev.storage_key, ev.sha256_hash)
        if not valid:
            ev.verification_status = "Flagged"
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Stored file failed SHA-256 verification and has been marked Flagged.",
            )

    ev.verification_status = payload.verification_status
    ev.reviewed_by_user_id = current_user.id
    ev.reviewed_at = datetime.now(UTC)

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Evidence",
        module="Evidence Management",
        entity_type="Evidence",
        entity_id=ev.id,
        entity_ref=ev.code,
        action=f"Marked evidence '{ev.code}' as '{ev.verification_status}'",
        changes={"verification_status": ev.verification_status},
        request=request,
    )
    db.commit()
    db.refresh(ev)
    return serialize_evidence(db, ev)


@router.put("/{evidence_id}", response_model=EvidenceOut)
def update_evidence_metadata(
    evidence_id: UUID,
    payload: EvidenceUpdate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor", "Department Head")),
    db: Session = Depends(get_db),
) -> EvidenceOut:
    ev = db.get(Evidence, evidence_id)
    if ev is None or ev.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence artifact not found.")

    company = db.get(Company, current_user.company_id)
    fields_set = payload.model_fields_set
    link_fields = {"audit_id", "finding_id", "corrective_action_id", "checklist_item_id"}
    if company and company.sha_lock_enabled and ev.verification_status == "Verified" and (fields_set & link_fields):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verified evidence links are protected while Enterprise SHA-256 Lock is active.",
        )

    target_dept_id: UUID | None = None
    if "audit_id" in fields_set and payload.audit_id is not None:
        audit = db.get(Audit, payload.audit_id)
        if audit is None or audit.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit not found.")
        target_dept_id = audit.department_id
    elif ev.audit_id:
        audit = db.get(Audit, ev.audit_id)
        if audit:
            target_dept_id = audit.department_id

    if "finding_id" in fields_set and payload.finding_id is not None:
        finding = db.get(Finding, payload.finding_id)
        if finding is None or finding.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")
        if target_dept_id is None:
            target_dept_id = finding.department_id

    if "corrective_action_id" in fields_set and payload.corrective_action_id is not None:
        act = db.get(CorrectiveAction, payload.corrective_action_id)
        if act is None or act.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrective action not found.")

    if "checklist_item_id" in fields_set and payload.checklist_item_id is not None:
        ci = db.get(ChecklistItem, payload.checklist_item_id)
        if ci is None or ci.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found.")

    if current_user.role == "Department Head":
        if ev.uploaded_by_user_id != current_user.id and target_dept_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Department Heads can only modify evidence linked to their department.",
            )
        if target_dept_id is not None:
            ensure_department_scope(current_user, target_dept_id)

    changes: dict[str, str | None] = {}
    for field in ("audit_id", "finding_id", "corrective_action_id", "checklist_item_id", "tag"):
        if field in fields_set:
            val = getattr(payload, field)
            setattr(ev, field, val)
            changes[field] = str(val) if val is not None else None

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Evidence",
        module="Evidence Management",
        entity_type="Evidence",
        entity_id=ev.id,
        entity_ref=ev.code,
        action=f"Updated evidence '{ev.code}' metadata and linkage",
        changes=changes,
        request=request,
    )
    db.commit()
    db.refresh(ev)
    return serialize_evidence(db, ev)


@router.get("/{evidence_id}/history", response_model=list[AuditHistoryOut])
def get_evidence_history(
    evidence_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuditHistoryOut]:
    ev = db.get(Evidence, evidence_id)
    if ev is None or ev.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence artifact not found.")

    rows = db.scalars(
        select(AuditHistory)
        .where(
            AuditHistory.company_id == current_user.company_id,
            AuditHistory.entity_type == "Evidence",
            AuditHistory.entity_id == ev.id,
        )
        .order_by(AuditHistory.created_at.desc())
    ).all()
    return [AuditHistoryOut.model_validate(r) for r in rows]
