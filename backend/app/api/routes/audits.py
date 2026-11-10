from datetime import datetime, UTC
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.audit import Audit, AuditResponse, AuditScope, Checklist, ChecklistItem
from app.models.core import Department, User
from app.models.governance import Evidence
from app.schemas.audit import (
    AuditCreate,
    AuditOut,
    AuditResponseOut,
    AuditScopeOut,
    AuditStageOut,
    AuditUpdate,
    ChecklistItemOut,
    ChecklistOut,
    SubmitAuditResponsesRequest,
    SubmitAuditResponsesResult,
)
from app.schemas.common import PaginatedResponse
from app.services.audit_history import record_audit_history
from app.services.scoring import (
    ALLOWED_AUDIT_TRANSITIONS,
    compute_audit_stages,
    compute_initials,
    recalculate_audit_score,
    response_value_to_factor,
    validate_audit_status_transition,
)

router = APIRouter(tags=["Audits & Checklists"])


def serialize_audit(db: Session, audit: Audit) -> AuditOut:
    dept = db.get(Department, audit.department_id)
    lead = db.get(User, audit.lead_auditor_id) if audit.lead_auditor_id else None

    controls_evaluated = (
        db.scalar(select(func.count(AuditResponse.id)).where(AuditResponse.audit_id == audit.id)) or 0
    )
    domain_items_count = (
        db.scalar(
            select(func.count(ChecklistItem.id))
            .join(Checklist, Checklist.id == ChecklistItem.checklist_id)
            .where(
                Checklist.company_id == audit.company_id,
                Checklist.domain == audit.domain,
                Checklist.is_active.is_(True),
            )
        )
        or 0
    )
    controls_total = max(domain_items_count, controls_evaluated)
    stages = [AuditStageOut(**s) for s in compute_audit_stages(audit.status, controls_evaluated, controls_total)]
    allowed_next = list(ALLOWED_AUDIT_TRANSITIONS.get(audit.status, ()))

    return AuditOut(
        id=audit.id,
        company_id=audit.company_id,
        department_id=audit.department_id,
        department_name=dept.name if dept else "Unknown Department",
        department_code=dept.code if dept else "N/A",
        lead_auditor_id=audit.lead_auditor_id,
        lead_auditor_name=lead.full_name if lead else "Unassigned",
        lead_auditor_initials=compute_initials(lead.full_name) if lead else "UA",
        lead_auditor_role=(lead.job_title or lead.role) if lead else "Auditor",
        code=audit.code,
        title=audit.title,
        domain=audit.domain,  # type: ignore[arg-type]
        framework=audit.framework,
        status=audit.status,  # type: ignore[arg-type]
        computed_score=float(audit.computed_score) if audit.computed_score is not None else None,
        controls_evaluated=int(controls_evaluated),
        controls_total=int(controls_total),
        scheduled_start=audit.scheduled_start,
        target_due_date=audit.target_due_date,
        completed_at=audit.completed_at,
        summary=audit.summary,
        scopes=[AuditScopeOut.model_validate(s) for s in audit.scopes],
        stages=stages,
        allowed_next_statuses=allowed_next,  # type: ignore[arg-type]
        created_at=audit.created_at,
        updated_at=audit.updated_at,
    )


@router.get("/audits", response_model=PaginatedResponse[AuditOut])
def list_audits(
    domain: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    department_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[AuditOut]:
    stmt = (
        select(Audit)
        .options(selectinload(Audit.scopes))
        .where(Audit.company_id == current_user.company_id)
    )
    if domain:
        stmt = stmt.where(Audit.domain == domain)
    if status_filter:
        stmt = stmt.where(Audit.status == status_filter)
    if department_id:
        stmt = stmt.where(Audit.department_id == department_id)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Audit.code.ilike(pattern),
                Audit.title.ilike(pattern),
                Audit.framework.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Audit.created_at.desc()).offset(offset).limit(limit)).all()
    return PaginatedResponse(
        items=[serialize_audit(db, row) for row in rows],
        total=int(total),
        limit=limit,
        offset=offset,
    )


@router.post("/audits", response_model=AuditOut, status_code=status.HTTP_201_CREATED)
def create_audit(
    payload: AuditCreate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor")),
    db: Session = Depends(get_db),
) -> AuditOut:
    dept = db.get(Department, payload.department_id)
    if dept is None or dept.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

    if payload.lead_auditor_id is not None:
        lead = db.get(User, payload.lead_auditor_id)
        if lead is None or lead.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead auditor user not found.")

    if payload.code:
        audit_code = payload.code.strip().upper()
    else:
        existing_cnt = (
            db.scalar(select(func.count(Audit.id)).where(Audit.company_id == current_user.company_id)) or 0
        )
        year = datetime.now(UTC).year
        audit_code = f"AUD-{year}-{110 + existing_cnt + 1:03d}"

    duplicate = db.scalar(
        select(Audit).where(Audit.company_id == current_user.company_id, Audit.code == audit_code)
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Audit code '{audit_code}' already exists.")

    audit = Audit(
        company_id=current_user.company_id,
        department_id=payload.department_id,
        lead_auditor_id=payload.lead_auditor_id or current_user.id,
        created_by_id=current_user.id,
        code=audit_code,
        title=payload.title.strip(),
        domain=payload.domain,
        framework=payload.framework.strip(),
        status=payload.status,
        scheduled_start=payload.scheduled_start,
        target_due_date=payload.target_due_date,
        summary=payload.summary,
    )
    db.add(audit)
    db.flush()

    for scope_in in payload.scopes:
        db.add(
            AuditScope(
                company_id=current_user.company_id,
                audit_id=audit.id,
                scope_name=scope_in.scope_name,
                system_or_process=scope_in.system_or_process,
                regulatory_clause=scope_in.regulatory_clause,
                in_scope=scope_in.in_scope,
            )
        )

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Audit Management",
        entity_type="Audit",
        entity_id=audit.id,
        entity_ref=audit.code,
        action=f"Scheduled {audit.domain} audit engagement '{audit.title}'",
        changes={"status": audit.status, "framework": audit.framework},
        request=request,
    )
    db.commit()
    db.refresh(audit)
    return serialize_audit(db, audit)


@router.get("/audits/{audit_id}", response_model=AuditOut)
def get_audit(
    audit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditOut:
    audit = db.scalar(
        select(Audit)
        .options(selectinload(Audit.scopes))
        .where(Audit.id == audit_id, Audit.company_id == current_user.company_id)
    )
    if audit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit not found.")
    return serialize_audit(db, audit)


@router.put("/audits/{audit_id}", response_model=AuditOut)
def update_audit(
    audit_id: UUID,
    payload: AuditUpdate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor")),
    db: Session = Depends(get_db),
) -> AuditOut:
    audit = db.scalar(
        select(Audit)
        .options(selectinload(Audit.scopes))
        .where(Audit.id == audit_id, Audit.company_id == current_user.company_id)
    )
    if audit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit not found.")

    update_data = payload.model_dump(exclude_unset=True)
    if "department_id" in update_data and update_data["department_id"] is not None:
        dept = db.get(Department, update_data["department_id"])
        if dept is None or dept.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")
    if "lead_auditor_id" in update_data and update_data["lead_auditor_id"] is not None:
        lead = db.get(User, update_data["lead_auditor_id"])
        if lead is None or lead.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead auditor not found.")

    if "status" in update_data and update_data["status"] is not None:
        target_status = update_data["status"]
        validate_audit_status_transition(db, audit, target_status)
        if target_status == "Closed" and audit.completed_at is None:
            audit.completed_at = datetime.now(UTC)

    for field, value in update_data.items():
        setattr(audit, field, value)

    category = "Sign-Off" if update_data.get("status") == "Closed" else "Mutation"
    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category=category,
        module="Audit Management",
        entity_type="Audit",
        entity_id=audit.id,
        entity_ref=audit.code,
        action=f"Updated audit '{audit.title}'" + (f" -> status '{audit.status}'" if "status" in update_data else ""),
        changes=update_data,
        request=request,
    )
    db.commit()
    db.refresh(audit)
    return serialize_audit(db, audit)


@router.get("/checklists", response_model=list[ChecklistOut])
def list_checklists(
    domain: str | None = Query(default=None),
    audit_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChecklistOut]:
    stmt = (
        select(Checklist)
        .options(selectinload(Checklist.items))
        .where(Checklist.company_id == current_user.company_id, Checklist.is_active.is_(True))
    )
    if domain:
        stmt = stmt.where(Checklist.domain == domain)
    checklists = db.scalars(stmt.order_by(Checklist.domain, Checklist.code)).all()

    resp_stmt = select(AuditResponse).where(AuditResponse.company_id == current_user.company_id)
    if audit_id:
        resp_stmt = resp_stmt.where(AuditResponse.audit_id == audit_id)
    responses = db.scalars(resp_stmt.order_by(AuditResponse.tested_at.desc())).all()

    latest_resp_by_item: dict[UUID, AuditResponse] = {}
    for r in responses:
        if r.checklist_item_id not in latest_resp_by_item:
            latest_resp_by_item[r.checklist_item_id] = r

    ev_counts_rows = db.execute(
        select(Evidence.checklist_item_id, func.count(Evidence.id))
        .where(Evidence.company_id == current_user.company_id, Evidence.checklist_item_id.is_not(None))
        .group_by(Evidence.checklist_item_id)
    ).all()
    ev_counts = {row[0]: int(row[1]) for row in ev_counts_rows}

    users_map = {
        u.id: u.full_name
        for u in db.scalars(select(User).where(User.company_id == current_user.company_id)).all()
    }

    output: list[ChecklistOut] = []
    for chk in checklists:
        items_out: list[ChecklistItemOut] = []
        for item in chk.items:
            latest = latest_resp_by_item.get(item.id)
            items_out.append(
                ChecklistItemOut(
                    id=item.id,
                    checklist_id=item.checklist_id,
                    checklist_code=chk.code,
                    framework=chk.framework,
                    domain=chk.domain,  # type: ignore[arg-type]
                    control_code=item.control_code,
                    title=item.title,
                    test_procedure=item.test_procedure,
                    weight=float(item.weight),
                    display_order=item.display_order,
                    latest_response=latest.response_value if latest else None,  # type: ignore[arg-type]
                    latest_score_factor=(
                        float(latest.score_factor) if latest and latest.score_factor is not None else None
                    ),
                    latest_auditor_notes=latest.auditor_notes if latest else None,
                    latest_tested_at=latest.tested_at if latest else None,
                    responder_name=users_map.get(latest.responder_user_id) if latest and latest.responder_user_id else None,
                    evidence_count=ev_counts.get(item.id, 0),
                )
            )
        output.append(
            ChecklistOut(
                id=chk.id,
                company_id=chk.company_id,
                code=chk.code,
                title=chk.title,
                domain=chk.domain,  # type: ignore[arg-type]
                framework=chk.framework,
                version=chk.version,
                is_active=chk.is_active,
                items=items_out,
            )
        )
    return output


@router.get("/audits/{audit_id}/responses", response_model=list[AuditResponseOut])
def list_audit_responses(
    audit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuditResponseOut]:
    audit = db.get(Audit, audit_id)
    if audit is None or audit.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit not found.")

    rows = db.execute(
        select(AuditResponse, ChecklistItem, User.full_name)
        .join(ChecklistItem, ChecklistItem.id == AuditResponse.checklist_item_id)
        .outerjoin(User, User.id == AuditResponse.responder_user_id)
        .where(AuditResponse.audit_id == audit.id)
        .order_by(ChecklistItem.display_order)
    ).all()

    return [
        AuditResponseOut(
            id=resp.id,
            audit_id=resp.audit_id,
            checklist_item_id=resp.checklist_item_id,
            control_code=item.control_code,
            item_title=item.title,
            responder_user_id=resp.responder_user_id,
            responder_name=responder_name,
            response_value=resp.response_value,  # type: ignore[arg-type]
            score_factor=float(resp.score_factor) if resp.score_factor is not None else None,
            weight=float(item.weight),
            auditor_notes=resp.auditor_notes,
            tested_at=resp.tested_at,
        )
        for resp, item, responder_name in rows
    ]


@router.post("/audits/{audit_id}/responses", response_model=SubmitAuditResponsesResult)
def submit_audit_responses(
    audit_id: UUID,
    payload: SubmitAuditResponsesRequest,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor")),
    db: Session = Depends(get_db),
) -> SubmitAuditResponsesResult:
    audit = db.get(Audit, audit_id)
    if audit is None or audit.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit not found.")

    if audit.status == "Closed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Closed audits are finalized and cannot accept new control responses.",
        )

    now = datetime.now(UTC)
    for item_in in payload.responses:
        chk_item = db.get(ChecklistItem, item_in.checklist_item_id)
        if chk_item is None or chk_item.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Checklist item '{item_in.checklist_item_id}' not found.",
            )

        factor = response_value_to_factor(item_in.response_value)
        existing_resp = db.scalar(
            select(AuditResponse).where(
                AuditResponse.audit_id == audit.id,
                AuditResponse.checklist_item_id == chk_item.id,
            )
        )
        if existing_resp is not None:
            existing_resp.response_value = item_in.response_value
            existing_resp.score_factor = factor
            existing_resp.auditor_notes = item_in.auditor_notes
            existing_resp.responder_user_id = current_user.id
            existing_resp.tested_at = now
        else:
            db.add(
                AuditResponse(
                    company_id=current_user.company_id,
                    audit_id=audit.id,
                    checklist_item_id=chk_item.id,
                    responder_user_id=current_user.id,
                    response_value=item_in.response_value,
                    score_factor=factor,
                    auditor_notes=item_in.auditor_notes,
                    tested_at=now,
                )
            )

    if audit.status in {"Draft", "Scheduled"}:
        audit.status = "In Progress"

    db.flush()
    new_score, evaluated_cnt, _ = recalculate_audit_score(db, audit)
    total_domain_controls = (
        db.scalar(
            select(func.count(ChecklistItem.id))
            .join(Checklist, Checklist.id == ChecklistItem.checklist_id)
            .where(
                Checklist.company_id == current_user.company_id,
                Checklist.domain == audit.domain,
                Checklist.is_active.is_(True),
            )
        )
        or evaluated_cnt
    )

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Control Test",
        module="Audit Checklists",
        entity_type="Audit",
        entity_id=audit.id,
        entity_ref=audit.code,
        action=f"Submitted {len(payload.responses)} checklist test response(s); score recalculated to {new_score}%",
        changes={"saved_count": len(payload.responses), "computed_score": new_score},
        request=request,
    )
    db.commit()

    saved_responses = list_audit_responses(audit.id, current_user=current_user, db=db)
    return SubmitAuditResponsesResult(
        audit_id=audit.id,
        audit_code=audit.code,
        computed_score=new_score,
        controls_evaluated=evaluated_cnt,
        controls_total=max(int(total_domain_controls), evaluated_cnt),
        saved_count=len(payload.responses),
        responses=saved_responses,
    )

