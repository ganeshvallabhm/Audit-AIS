from datetime import datetime, UTC
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
from app.models.audit import Audit, ChecklistItem
from app.models.core import Department, User
from app.models.governance import CorrectiveAction, Evidence, Finding
from app.schemas.common import PaginatedResponse
from app.schemas.governance import EvidenceOut, EvidenceVerifyRequest
from app.services.audit_history import record_audit_history
from app.services.evidence_storage import store_uploaded_evidence, verify_stored_file_sha256

router = APIRouter(prefix="/evidence", tags=["Evidence Vault"])


def serialize_evidence(db: Session, ev: Evidence) -> EvidenceOut:
    audit = db.get(Audit, ev.audit_id) if ev.audit_id else None
    dept_name = None
    if audit:
        dept = db.get(Department, audit.department_id)
        dept_name = dept.name if dept else None
    finding = db.get(Finding, ev.finding_id) if ev.finding_id else None
    if dept_name is None and finding:
        dept = db.get(Department, finding.department_id)
        dept_name = dept.name if dept else None

    uploader = db.get(User, ev.uploaded_by_user_id)
    reviewer = db.get(User, ev.reviewed_by_user_id) if ev.reviewed_by_user_id else None

    return EvidenceOut(
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
        uploaded_by_name=uploader.full_name if uploader else "System",
        reviewed_by_user_id=ev.reviewed_by_user_id,
        reviewed_by_name=reviewer.full_name if reviewer else None,
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
    rows = db.scalars(stmt.order_by(Evidence.created_at.desc()).offset(offset).limit(limit)).all()
    return PaginatedResponse(
        items=[serialize_evidence(db, r) for r in rows],
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

    cnt = db.scalar(select(func.count(Evidence.id)).where(Evidence.company_id == current_user.company_id)) or 0
    ev_code = f"EVD-{4100 + cnt + 1}"

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

