from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import ensure_department_scope, get_current_user, require_roles
from app.models.audit import Audit
from app.models.core import Department, User
from app.models.governance import CorrectiveAction, Evidence, Finding, Recommendation, Risk
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.governance import (
    CorrectiveActionCreate,
    CorrectiveActionOut,
    CorrectiveActionUpdate,
    FindingCreate,
    FindingEvidenceRefOut,
    FindingOut,
    FindingUpdate,
    RecommendationCreate,
    RecommendationOut,
    RecommendationRespondRequest,
    RiskCreate,
    RiskEscalateRequest,
    RiskFrameworkItem,
    RiskOut,
    RiskUpdate,
)
from app.services.audit_history import record_audit_history
from app.services.notifications import (
    notify_action_assigned,
    notify_critical_risk,
    notify_finding_created,
    notify_verification_outcome,
    notify_verification_requested,
)
from app.services.scoring import (
    classify_risk_severity,
    compute_initials,
    compute_sla_countdown,
    generate_next_code,
)

router = APIRouter(tags=["Findings, Risks & Corrective Actions"])


def serialize_actions(db: Session, actions: list[CorrectiveAction]) -> list[CorrectiveActionOut]:
    if not actions:
        return []

    finding_ids = {a.finding_id for a in actions if a.finding_id is not None}
    risk_ids = {a.risk_id for a in actions if a.risk_id is not None}
    user_ids = {
        uid
        for a in actions
        for uid in (a.assigned_to_user_id, a.verified_by_user_id)
        if uid is not None
    }

    finding_map: dict[UUID, tuple[str, str]] = (
        {
            f_id: (f_code, f_title)
            for f_id, f_code, f_title in db.execute(
                select(Finding.id, Finding.code, Finding.title).where(Finding.id.in_(finding_ids))
            ).all()
        }
        if finding_ids
        else {}
    )
    risk_map: dict[UUID, str] = (
        {
            r_id: r_code
            for r_id, r_code in db.execute(
                select(Risk.id, Risk.code).where(Risk.id.in_(risk_ids))
            ).all()
        }
        if risk_ids
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

    output: list[CorrectiveActionOut] = []
    for act in actions:
        f_info = finding_map.get(act.finding_id) if act.finding_id else None
        output.append(
            CorrectiveActionOut(
                id=act.id,
                company_id=act.company_id,
                finding_id=act.finding_id,
                finding_code=f_info[0] if f_info else None,
                finding_title=f_info[1] if f_info else None,
                recommendation_id=act.recommendation_id,
                risk_id=act.risk_id,
                risk_code=risk_map.get(act.risk_id) if act.risk_id else None,
                assigned_to_user_id=act.assigned_to_user_id,
                assigned_to_name=user_map.get(act.assigned_to_user_id) if act.assigned_to_user_id else None,
                verified_by_user_id=act.verified_by_user_id,
                verified_by_name=user_map.get(act.verified_by_user_id) if act.verified_by_user_id else None,
                code=act.code,
                step_order=act.step_order,
                title=act.title,
                detail=act.detail,
                status=act.status,  # type: ignore[arg-type]
                progress_percent=act.progress_percent,
                due_date=act.due_date,
                completed_at=act.completed_at,
                verified_at=act.verified_at,
                created_at=act.created_at,
                updated_at=act.updated_at,
            )
        )
    return output


def serialize_action(db: Session, act: CorrectiveAction) -> CorrectiveActionOut:
    return serialize_actions(db, [act])[0]


def serialize_findings(db: Session, findings: list[Finding]) -> list[FindingOut]:
    if not findings:
        return []

    finding_ids = [f.id for f in findings]
    audit_ids = {f.audit_id for f in findings}
    dept_ids = {f.department_id for f in findings}

    user_ids: set[UUID] = set()
    all_actions: list[CorrectiveAction] = []
    for f in findings:
        if f.owner_user_id:
            user_ids.add(f.owner_user_id)
        if f.lead_auditor_id:
            user_ids.add(f.lead_auditor_id)
        if f.signed_off_by_id:
            user_ids.add(f.signed_off_by_id)
        for rec in f.recommendations:
            if rec.author_user_id:
                user_ids.add(rec.author_user_id)
        all_actions.extend(f.corrective_actions)

    audit_map: dict[UUID, Audit] = {
        a.id: a for a in db.scalars(select(Audit).where(Audit.id.in_(audit_ids))).all()
    }
    dept_map: dict[UUID, Department] = {
        d.id: d for d in db.scalars(select(Department).where(Department.id.in_(dept_ids))).all()
    }
    user_map: dict[UUID, User] = (
        {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()}
        if user_ids
        else {}
    )

    ev_rows = db.scalars(
        select(Evidence).where(Evidence.finding_id.in_(finding_ids)).order_by(Evidence.created_at.desc())
    ).all()
    ev_by_finding: dict[UUID, list[Evidence]] = {}
    for ev in ev_rows:
        if ev.finding_id:
            ev_by_finding.setdefault(ev.finding_id, []).append(ev)

    serialized_actions = serialize_actions(db, all_actions)
    action_by_id: dict[UUID, CorrectiveActionOut] = {a.id: a for a in serialized_actions}

    output: list[FindingOut] = []
    for f in findings:
        audit = audit_map.get(f.audit_id)
        dept = dept_map.get(f.department_id)
        owner = user_map.get(f.owner_user_id) if f.owner_user_id else None
        lead = user_map.get(f.lead_auditor_id) if f.lead_auditor_id else None
        signer = user_map.get(f.signed_off_by_id) if f.signed_off_by_id else None

        countdown, is_overdue = compute_sla_countdown(f.target_sla_date, f.status)
        actions = f.corrective_actions
        if actions:
            progress_pct = round(sum(a.progress_percent for a in actions) / len(actions))
        else:
            progress_pct = 100 if f.status == "Closed" else (90 if f.status == "Verification Pending" else 0)

        recs_out = [
            RecommendationOut(
                id=rec.id,
                finding_id=rec.finding_id,
                risk_id=rec.risk_id,
                author_user_id=rec.author_user_id,
                author_name=user_map[rec.author_user_id].full_name
                if rec.author_user_id and rec.author_user_id in user_map
                else None,
                title=rec.title,
                guidance=rec.guidance,
                priority=rec.priority,  # type: ignore[arg-type]
                management_response=rec.management_response,
                accepted_by_management=rec.accepted_by_management,
                accepted_at=rec.accepted_at,
                created_at=rec.created_at,
                updated_at=rec.updated_at,
            )
            for rec in f.recommendations
        ]

        output.append(
            FindingOut(
                id=f.id,
                company_id=f.company_id,
                audit_id=f.audit_id,
                audit_code=audit.code if audit else "N/A",
                audit_title=audit.title if audit else "Audit Engagement",
                audit_response_id=f.audit_response_id,
                department_id=f.department_id,
                department_name=dept.name if dept else "Unknown",
                department_code=dept.code if dept else "N/A",
                owner_user_id=f.owner_user_id,
                owner_name=owner.full_name if owner else "Unassigned",
                owner_initials=compute_initials(owner.full_name) if owner else "UA",
                lead_auditor_id=f.lead_auditor_id,
                lead_auditor_name=lead.full_name if lead else "Unassigned",
                signed_off_by_id=f.signed_off_by_id,
                signed_off_by_name=signer.full_name if signer else None,
                code=f.code,
                title=f.title,
                root_cause=f.root_cause,
                workstream=f.workstream,
                severity=f.severity,  # type: ignore[arg-type]
                status=f.status,  # type: ignore[arg-type]
                target_sla_date=f.target_sla_date,
                sla_countdown=countdown,
                is_overdue=is_overdue,
                progress_percent=progress_pct,
                management_response=f.management_response,
                rejection_reason=f.rejection_reason,
                signed_off_at=f.signed_off_at,
                recommendations=recs_out,
                corrective_actions=[action_by_id[a.id] for a in actions],
                evidence_items=[
                    FindingEvidenceRefOut(
                        id=e.id,
                        code=e.code,
                        filename=e.original_filename,
                        mime_type=e.mime_type,
                        byte_size=e.byte_size,
                        sha256_hash=e.sha256_hash,
                        verification_status=e.verification_status,  # type: ignore[arg-type]
                        tag=e.tag,
                    )
                    for e in ev_by_finding.get(f.id, [])
                ],
                created_at=f.created_at,
                updated_at=f.updated_at,
            )
        )
    return output


def serialize_finding(db: Session, f: Finding) -> FindingOut:
    return serialize_findings(db, [f])[0]


def serialize_risks(db: Session, risks: list[Risk]) -> list[RiskOut]:
    if not risks:
        return []

    risk_ids = [r.id for r in risks]
    dept_ids = {r.department_id for r in risks}
    owner_ids = {r.owner_user_id for r in risks if r.owner_user_id is not None}
    audit_ids = {r.linked_audit_id for r in risks if r.linked_audit_id is not None}

    dept_map: dict[UUID, Department] = {
        d.id: d for d in db.scalars(select(Department).where(Department.id.in_(dept_ids))).all()
    }
    owner_map: dict[UUID, User] = (
        {u.id: u for u in db.scalars(select(User).where(User.id.in_(owner_ids))).all()}
        if owner_ids
        else {}
    )
    audit_map: dict[UUID, Audit] = (
        {a.id: a for a in db.scalars(select(Audit).where(Audit.id.in_(audit_ids))).all()}
        if audit_ids
        else {}
    )

    actions = list(
        db.scalars(
            select(CorrectiveAction)
            .where(CorrectiveAction.risk_id.in_(risk_ids))
            .order_by(CorrectiveAction.step_order)
        ).all()
    )
    serialized_actions = serialize_actions(db, actions)
    action_by_risk: dict[UUID, list[CorrectiveActionOut]] = {}
    raw_by_risk: dict[UUID, list[CorrectiveAction]] = {}
    for raw_act, act_out in zip(actions, serialized_actions, strict=True):
        if raw_act.risk_id:
            action_by_risk.setdefault(raw_act.risk_id, []).append(act_out)
            raw_by_risk.setdefault(raw_act.risk_id, []).append(raw_act)

    output: list[RiskOut] = []
    for r in risks:
        dept = dept_map.get(r.department_id)
        owner = owner_map.get(r.owner_user_id) if r.owner_user_id else None
        audit = audit_map.get(r.linked_audit_id) if r.linked_audit_id else None

        res_prob = r.residual_probability if r.residual_probability is not None else r.probability
        res_imp = r.residual_impact if r.residual_impact is not None else r.impact
        residual_score = res_prob * res_imp
        residual_sev = classify_risk_severity(residual_score)

        r_actions = raw_by_risk.get(r.id, [])
        if r_actions:
            progress_pct = round(sum(a.progress_percent for a in r_actions) / len(r_actions))
        else:
            progress_pct = 100 if r.status == "Mitigated" else (80 if r.status == "In Review" else 40)

        output.append(
            RiskOut(
                id=r.id,
                company_id=r.company_id,
                department_id=r.department_id,
                department_name=dept.name if dept else "Unknown",
                department_code=dept.code if dept else "N/A",
                owner_user_id=r.owner_user_id,
                owner_name=owner.full_name if owner else "Unassigned",
                owner_initials=compute_initials(owner.full_name) if owner else "UA",
                owner_role=(owner.job_title or owner.role) if owner else "Risk Owner",
                linked_audit_id=r.linked_audit_id,
                linked_audit_code=audit.code if audit else None,
                code=r.code,
                title=r.title,
                scope_description=r.scope_description,
                category=r.category,  # type: ignore[arg-type]
                probability=r.probability,
                impact=r.impact,
                inherent_score=r.inherent_score,
                severity=r.severity,  # type: ignore[arg-type]
                residual_probability=r.residual_probability,
                residual_impact=r.residual_impact,
                residual_score=residual_score,
                residual_level=f"{residual_sev}",
                mitigation_strategy=r.mitigation_strategy,
                narrative=r.narrative,
                affected_assets=list(r.affected_assets or []),
                mapped_frameworks=[RiskFrameworkItem(**fw) for fw in (r.mapped_frameworks or [])],
                escalation_target=r.escalation_target,
                next_review_date=r.next_review_date,
                status=r.status,  # type: ignore[arg-type]
                progress_percent=progress_pct,
                corrective_actions=action_by_risk.get(r.id, []),
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )
    return output


def serialize_risk(db: Session, r: Risk) -> RiskOut:
    return serialize_risks(db, [r])[0]


# ==================== FINDINGS ====================


@router.get("/findings", response_model=PaginatedResponse[FindingOut])
def list_findings(
    severity: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    department_id: UUID | None = Query(default=None),
    audit_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[FindingOut]:
    stmt = (
        select(Finding)
        .options(selectinload(Finding.recommendations), selectinload(Finding.corrective_actions))
        .where(Finding.company_id == current_user.company_id)
    )
    if severity:
        stmt = stmt.where(Finding.severity == severity)
    if status_filter:
        stmt = stmt.where(Finding.status == status_filter)
    if department_id:
        stmt = stmt.where(Finding.department_id == department_id)
    if audit_id:
        stmt = stmt.where(Finding.audit_id == audit_id)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Finding.code.ilike(pattern),
                Finding.title.ilike(pattern),
                Finding.root_cause.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.scalars(stmt.order_by(Finding.target_sla_date.asc()).offset(offset).limit(limit)).all())
    return PaginatedResponse(
        items=serialize_findings(db, rows),
        total=int(total),
        limit=limit,
        offset=offset,
    )


@router.post("/findings", response_model=FindingOut, status_code=status.HTTP_201_CREATED)
def create_finding(
    payload: FindingCreate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor")),
    db: Session = Depends(get_db),
) -> FindingOut:
    audit = db.get(Audit, payload.audit_id)
    if audit is None or audit.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit not found.")

    dept = db.get(Department, payload.department_id)
    if dept is None or dept.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

    if payload.code:
        code = payload.code.strip().upper()
    else:
        code = generate_next_code(db, Finding, current_user.company_id, "FND-", 1031)

    existing = db.scalar(
        select(Finding).where(Finding.company_id == current_user.company_id, Finding.code == code)
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Finding code '{code}' already exists.")

    finding = Finding(
        company_id=current_user.company_id,
        audit_id=payload.audit_id,
        audit_response_id=payload.audit_response_id,
        department_id=payload.department_id,
        owner_user_id=payload.owner_user_id or dept.head_user_id,
        lead_auditor_id=payload.lead_auditor_id or current_user.id,
        code=code,
        title=payload.title.strip(),
        root_cause=payload.root_cause.strip(),
        workstream=payload.workstream,
        severity=payload.severity,
        status=payload.status,
        target_sla_date=payload.target_sla_date,
        management_response=payload.management_response,
    )
    db.add(finding)
    db.flush()

    notify_finding_created(db, finding, dept)

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Findings & Actions",
        entity_type="Finding",
        entity_id=finding.id,
        entity_ref=finding.code,
        action=f"Raised {finding.severity} audit finding '{finding.title}'",
        changes={"severity": finding.severity, "target_sla_date": str(finding.target_sla_date)},
        request=request,
    )
    db.commit()
    db.refresh(finding)
    return serialize_finding(db, finding)


@router.put("/findings/{finding_id}", response_model=FindingOut)
def update_finding(
    finding_id: UUID,
    payload: FindingUpdate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor", "Department Head", "Management")),
    db: Session = Depends(get_db),
) -> FindingOut:
    finding = db.scalar(
        select(Finding)
        .options(selectinload(Finding.recommendations), selectinload(Finding.corrective_actions))
        .where(Finding.id == finding_id, Finding.company_id == current_user.company_id)
    )
    if finding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")

    prev_status = finding.status
    update_data = payload.model_dump(exclude_unset=True)

    # RBAC fine-grained checks per role
    if current_user.role == "Department Head":
        ensure_department_scope(current_user, finding.department_id)
        forbidden = set(update_data.keys()) - {"management_response", "status"}
        if forbidden or ("status" in update_data and update_data["status"] != "Verification Pending"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Department Heads can only submit management_response or mark a department finding Verification Pending.",
            )
    elif current_user.role == "Management":
        forbidden = set(update_data.keys()) - {"management_response", "sign_off", "status", "rejection_reason"}
        if forbidden or (
            "status" in update_data
            and update_data["status"] not in {"Closed", "In Progress", "Open"}
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Management role can only submit responses, approve sign-off, or reject verification back to In Progress.",
            )

    target_status = update_data.get("status")
    is_rejection = (
        prev_status == "Verification Pending"
        and target_status in {"In Progress", "Open"}
        and not update_data.get("sign_off")
    )
    if is_rejection:
        reason = (update_data.get("rejection_reason") or "").strip()
        if len(reason) < 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A clear rejection_reason (min 3 characters) is required when rejecting verification.",
            )
        finding.rejection_reason = reason
        finding.signed_off_by_id = None
        finding.signed_off_at = None

    if update_data.pop("sign_off", None):
        finding.signed_off_by_id = current_user.id
        finding.signed_off_at = datetime.now(UTC)
        finding.status = "Closed"
        finding.rejection_reason = None
    elif target_status == "Closed":
        finding.signed_off_by_id = finding.signed_off_by_id or current_user.id
        finding.signed_off_at = finding.signed_off_at or datetime.now(UTC)
        finding.rejection_reason = None

    for field, value in update_data.items():
        setattr(finding, field, value)

    if prev_status != "Verification Pending" and finding.status == "Verification Pending":
        notify_verification_requested(
            db,
            company_id=current_user.company_id,
            entity_type="Finding",
            entity_id=finding.id,
            entity_ref=finding.code,
            title=f"Verification Requested: {finding.code}",
            description=f"{finding.title} was submitted for executive/auditor verification sign-off.",
            link="/findings-and-actions",
            lead_user_id=finding.lead_auditor_id,
            event_tag=str(uuid4())[:8],
        )
    elif is_rejection:
        notify_verification_outcome(
            db,
            company_id=current_user.company_id,
            recipient_user_ids=[finding.owner_user_id],
            entity_type="Finding",
            entity_id=finding.id,
            title=f"Verification Rejected (Reopened): {finding.code}",
            description=f"Returned to {finding.status} by {current_user.full_name}. Reason: {finding.rejection_reason}",
            severity="warning",
            link="/findings-and-actions",
            event_tag=str(uuid4())[:8],
        )
    elif prev_status != "Closed" and finding.status == "Closed":
        notify_verification_outcome(
            db,
            company_id=current_user.company_id,
            recipient_user_ids=[finding.owner_user_id, finding.lead_auditor_id],
            entity_type="Finding",
            entity_id=finding.id,
            title=f"Finding Signed Off & Closed: {finding.code}",
            description=f"{finding.title} closed by {current_user.full_name}.",
            severity="info",
            link="/findings-and-actions",
            event_tag=str(uuid4())[:8],
        )

    category = "Sign-Off" if finding.status == "Closed" else "Mutation"
    action_msg = f"Updated finding '{finding.code}' (status: {finding.status})"
    if is_rejection:
        action_msg = f"Rejected verification & reopened finding '{finding.code}' -> {finding.status}"
    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category=category,
        module="Findings & Actions",
        entity_type="Finding",
        entity_id=finding.id,
        entity_ref=finding.code,
        action=action_msg,
        changes={k: str(v) for k, v in payload.model_dump(exclude_unset=True).items()},
        request=request,
    )
    db.commit()
    db.refresh(finding)
    return serialize_finding(db, finding)


@router.delete("/findings/{finding_id}", response_model=MessageResponse)
def delete_finding(
    finding_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    finding = db.get(Finding, finding_id)
    if finding is None or finding.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")
    if finding.status == "Closed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Closed findings have signed-off records and cannot be deleted.",
        )

    f_code = finding.code
    f_title = finding.title
    f_id = finding.id
    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Findings & Actions",
        entity_type="Finding",
        entity_id=f_id,
        entity_ref=f_code,
        action=f"Deleted non-closed finding '{f_code}: {f_title}'",
        request=request,
    )
    db.delete(finding)
    db.commit()
    return MessageResponse(detail=f"Finding '{f_code}' deleted.")


@router.post("/recommendations", response_model=RecommendationOut, status_code=status.HTTP_201_CREATED)
def create_recommendation(
    payload: RecommendationCreate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor")),
    db: Session = Depends(get_db),
) -> RecommendationOut:
    finding = db.get(Finding, payload.finding_id)
    if finding is None or finding.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")

    rec = Recommendation(
        company_id=current_user.company_id,
        finding_id=payload.finding_id,
        risk_id=payload.risk_id,
        author_user_id=current_user.id,
        title=payload.title.strip(),
        guidance=payload.guidance.strip(),
        priority=payload.priority,
    )
    db.add(rec)
    db.flush()

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Findings & Actions",
        entity_type="Recommendation",
        entity_id=rec.id,
        entity_ref=finding.code,
        action=f"Issued recommendation '{rec.title}' on finding {finding.code}",
        request=request,
    )
    db.commit()
    db.refresh(rec)
    return RecommendationOut(
        id=rec.id,
        finding_id=rec.finding_id,
        risk_id=rec.risk_id,
        author_user_id=rec.author_user_id,
        author_name=current_user.full_name,
        title=rec.title,
        guidance=rec.guidance,
        priority=rec.priority,  # type: ignore[arg-type]
        management_response=rec.management_response,
        accepted_by_management=rec.accepted_by_management,
        accepted_at=rec.accepted_at,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
    )


@router.post("/recommendations/{recommendation_id}/respond", response_model=RecommendationOut)
def respond_recommendation(
    recommendation_id: UUID,
    payload: RecommendationRespondRequest,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Department Head", "Management")),
    db: Session = Depends(get_db),
) -> RecommendationOut:
    rec = db.get(Recommendation, recommendation_id)
    if rec is None or rec.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recommendation not found.")

    finding = db.get(Finding, rec.finding_id)
    if finding and current_user.role == "Department Head":
        ensure_department_scope(current_user, finding.department_id)

    rec.management_response = payload.management_response.strip()
    rec.accepted_by_management = payload.accepted_by_management
    rec.accepted_at = datetime.now(UTC) if payload.accepted_by_management else None

    if rec.author_user_id and rec.author_user_id != current_user.id:
        notify_verification_outcome(
            db,
            company_id=current_user.company_id,
            recipient_user_ids=[rec.author_user_id],
            entity_type="Recommendation",
            entity_id=rec.id,
            title=f"Recommendation Response ({finding.code if finding else 'Audit'})",
            description=f"{current_user.full_name}: {rec.management_response[:160]}",
            severity="info" if rec.accepted_by_management else "warning",
            link="/findings-and-actions",
            event_tag=str(uuid4())[:8],
        )

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Findings & Actions",
        entity_type="Recommendation",
        entity_id=rec.id,
        entity_ref=finding.code if finding else str(rec.id)[:8],
        action=f"Submitted management response ({'Accepted' if payload.accepted_by_management else 'Pending'})",
        request=request,
    )
    db.commit()
    db.refresh(rec)
    author = db.get(User, rec.author_user_id) if rec.author_user_id else None
    return RecommendationOut(
        id=rec.id,
        finding_id=rec.finding_id,
        risk_id=rec.risk_id,
        author_user_id=rec.author_user_id,
        author_name=author.full_name if author else None,
        title=rec.title,
        guidance=rec.guidance,
        priority=rec.priority,  # type: ignore[arg-type]
        management_response=rec.management_response,
        accepted_by_management=rec.accepted_by_management,
        accepted_at=rec.accepted_at,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
    )


# ==================== CORRECTIVE ACTIONS ====================


@router.get("/actions", response_model=PaginatedResponse[CorrectiveActionOut])
def list_actions(
    finding_id: UUID | None = Query(default=None),
    risk_id: UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[CorrectiveActionOut]:
    stmt = select(CorrectiveAction).where(CorrectiveAction.company_id == current_user.company_id)
    if finding_id:
        stmt = stmt.where(CorrectiveAction.finding_id == finding_id)
    if risk_id:
        stmt = stmt.where(CorrectiveAction.risk_id == risk_id)
    if status_filter:
        stmt = stmt.where(CorrectiveAction.status == status_filter)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(CorrectiveAction.due_date.asc(), CorrectiveAction.step_order.asc())
            .offset(offset)
            .limit(limit)
        ).all()
    )
    return PaginatedResponse(
        items=serialize_actions(db, rows),
        total=int(total),
        limit=limit,
        offset=offset,
    )


@router.post("/actions", response_model=CorrectiveActionOut, status_code=status.HTTP_201_CREATED)
def create_action(
    payload: CorrectiveActionCreate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor", "Department Head")),
    db: Session = Depends(get_db),
) -> CorrectiveActionOut:
    if payload.finding_id is None and payload.risk_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A Corrective Action must link to either finding_id or risk_id.",
        )

    target_dept_id: UUID | None = None
    if payload.finding_id:
        f = db.get(Finding, payload.finding_id)
        if f is None or f.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")
        target_dept_id = f.department_id
    if payload.risk_id:
        r = db.get(Risk, payload.risk_id)
        if r is None or r.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found.")
        if target_dept_id is None:
            target_dept_id = r.department_id

    if current_user.role == "Department Head":
        ensure_department_scope(current_user, target_dept_id)

    if payload.code:
        code = payload.code.strip().upper()
    else:
        code = generate_next_code(db, CorrectiveAction, current_user.company_id, "ACT-", 111)

    existing_action = db.scalar(
        select(CorrectiveAction).where(
            CorrectiveAction.company_id == current_user.company_id,
            CorrectiveAction.code == code,
        )
    )
    if existing_action is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Corrective action code '{code}' already exists.",
        )

    action = CorrectiveAction(
        company_id=current_user.company_id,
        finding_id=payload.finding_id,
        recommendation_id=payload.recommendation_id,
        risk_id=payload.risk_id,
        assigned_to_user_id=payload.assigned_to_user_id or current_user.id,
        code=code,
        step_order=payload.step_order,
        title=payload.title.strip(),
        detail=payload.detail,
        status=payload.status,
        progress_percent=payload.progress_percent,
        due_date=payload.due_date,
    )
    db.add(action)
    db.flush()

    if action.assigned_to_user_id != current_user.id:
        notify_action_assigned(db, action)

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Findings & Actions",
        entity_type="CorrectiveAction",
        entity_id=action.id,
        entity_ref=action.code,
        action=f"Created corrective action '{action.title}'",
        request=request,
    )
    db.commit()
    db.refresh(action)
    return serialize_action(db, action)


@router.put("/actions/{action_id}", response_model=CorrectiveActionOut)
def update_action(
    action_id: UUID,
    payload: CorrectiveActionUpdate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor", "Department Head")),
    db: Session = Depends(get_db),
) -> CorrectiveActionOut:
    action = db.get(CorrectiveAction, action_id)
    if action is None or action.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrective action not found.")

    dept_id = None
    lead_auditor_id = None
    if action.finding_id:
        f = db.get(Finding, action.finding_id)
        dept_id = f.department_id if f else None
        lead_auditor_id = f.lead_auditor_id if f else None
    elif action.risk_id:
        r = db.get(Risk, action.risk_id)
        dept_id = r.department_id if r else None

    if current_user.role == "Department Head":
        ensure_department_scope(current_user, dept_id)
        if payload.status in {"Verified", "Rejected"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Auditors or Admins can verify or reject completed corrective actions.",
            )

    prev_assignee = action.assigned_to_user_id
    prev_status = action.status

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(action, field, value)

    if payload.status == "Submitted" and action.completed_at is None:
        action.completed_at = datetime.now(UTC)
        if "progress_percent" not in update_data:
            action.progress_percent = 100
    if payload.status == "Verified":
        action.verified_by_user_id = current_user.id
        action.verified_at = datetime.now(UTC)
        action.progress_percent = 100

    if action.assigned_to_user_id and action.assigned_to_user_id != prev_assignee:
        notify_action_assigned(db, action)

    if action.status == "Submitted" and prev_status != "Submitted":
        notify_verification_requested(
            db,
            company_id=current_user.company_id,
            entity_type="CorrectiveAction",
            entity_id=action.id,
            entity_ref=action.code,
            title=f"Action Submitted for Verification: {action.code}",
            description=f"{action.title} marked 100% submitted by {current_user.full_name}.",
            link="/findings-and-actions",
            lead_user_id=lead_auditor_id,
            event_tag=str(uuid4())[:8],
        )
    elif action.status in {"Verified", "Rejected"} and prev_status != action.status:
        notify_verification_outcome(
            db,
            company_id=current_user.company_id,
            recipient_user_ids=[action.assigned_to_user_id],
            entity_type="CorrectiveAction",
            entity_id=action.id,
            title=f"Corrective Action {action.status}: {action.code}",
            description=f"{action.title} was marked {action.status} by {current_user.full_name}.",
            severity="info" if action.status == "Verified" else "warning",
            link="/findings-and-actions",
            event_tag=str(uuid4())[:8],
        )

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Sign-Off" if payload.status == "Verified" else "Mutation",
        module="Findings & Actions",
        entity_type="CorrectiveAction",
        entity_id=action.id,
        entity_ref=action.code,
        action=f"Updated corrective action '{action.code}' -> {action.status} ({action.progress_percent}%)",
        changes=update_data,
        request=request,
    )
    db.commit()
    db.refresh(action)
    return serialize_action(db, action)


@router.delete("/actions/{action_id}", response_model=MessageResponse)
def delete_action(
    action_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    action = db.get(CorrectiveAction, action_id)
    if action is None or action.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Corrective action not found.")
    if action.status == "Verified":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verified corrective actions cannot be deleted.",
        )

    a_code = action.code
    a_title = action.title
    a_id = action.id
    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Findings & Actions",
        entity_type="CorrectiveAction",
        entity_id=a_id,
        entity_ref=a_code,
        action=f"Deleted corrective action '{a_code}: {a_title}'",
        request=request,
    )
    db.delete(action)
    db.commit()
    return MessageResponse(detail=f"Corrective action '{a_code}' deleted.")


# ==================== RISKS ====================


@router.get("/risks", response_model=PaginatedResponse[RiskOut])
def list_risks(
    category: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    probability: int | None = Query(default=None, ge=1, le=5),
    impact: int | None = Query(default=None, ge=1, le=5),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[RiskOut]:
    stmt = select(Risk).where(Risk.company_id == current_user.company_id)
    if category:
        stmt = stmt.where(Risk.category == category)
    if severity:
        stmt = stmt.where(Risk.severity == severity)
    if status_filter:
        stmt = stmt.where(Risk.status == status_filter)
    if probability is not None:
        stmt = stmt.where(Risk.probability == probability)
    if impact is not None:
        stmt = stmt.where(Risk.impact == impact)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Risk.code.ilike(pattern),
                Risk.title.ilike(pattern),
                Risk.scope_description.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.scalars(stmt.order_by(Risk.inherent_score.desc(), Risk.code).offset(offset).limit(limit)).all())
    return PaginatedResponse(
        items=serialize_risks(db, rows),
        total=int(total),
        limit=limit,
        offset=offset,
    )


@router.post("/risks", response_model=RiskOut, status_code=status.HTTP_201_CREATED)
def create_risk(
    payload: RiskCreate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor")),
    db: Session = Depends(get_db),
) -> RiskOut:
    dept = db.get(Department, payload.department_id)
    if dept is None or dept.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

    if payload.code:
        code = payload.code.strip().upper()
    else:
        code = generate_next_code(db, Risk, current_user.company_id, "RSK-", 41)

    existing = db.scalar(
        select(Risk).where(Risk.company_id == current_user.company_id, Risk.code == code)
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Risk code '{code}' already exists.")

    computed_severity = classify_risk_severity(payload.probability * payload.impact)
    risk = Risk(
        company_id=current_user.company_id,
        department_id=payload.department_id,
        owner_user_id=payload.owner_user_id or dept.head_user_id,
        linked_audit_id=payload.linked_audit_id,
        code=code,
        title=payload.title.strip(),
        scope_description=payload.scope_description.strip(),
        category=payload.category,
        probability=payload.probability,
        impact=payload.impact,
        severity=computed_severity,
        residual_probability=payload.residual_probability,
        residual_impact=payload.residual_impact,
        mitigation_strategy=payload.mitigation_strategy,
        narrative=payload.narrative,
        affected_assets=payload.affected_assets,
        mapped_frameworks=[fw.model_dump() for fw in payload.mapped_frameworks],
        escalation_target=payload.escalation_target,
        next_review_date=payload.next_review_date,
        status=payload.status,
    )
    db.add(risk)
    db.flush()

    if computed_severity == "Critical":
        notify_critical_risk(db, risk, event_tag="created")

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Risk Escalation" if computed_severity == "Critical" else "Mutation",
        module="Risk & Compliance",
        entity_type="Risk",
        entity_id=risk.id,
        entity_ref=risk.code,
        action=f"Registered risk '{risk.title}' ({risk.probability}x{risk.impact}={risk.probability * risk.impact} {computed_severity})",
        changes={"severity": computed_severity, "inherent_score": risk.probability * risk.impact},
        request=request,
    )
    db.commit()
    db.refresh(risk)
    return serialize_risk(db, risk)


@router.put("/risks/{risk_id}", response_model=RiskOut)
def update_risk(
    risk_id: UUID,
    payload: RiskUpdate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor", "Management")),
    db: Session = Depends(get_db),
) -> RiskOut:
    risk = db.get(Risk, risk_id)
    if risk is None or risk.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found.")

    prev_severity = risk.severity
    update_data = payload.model_dump(exclude_unset=True)
    if current_user.role == "Management":
        forbidden = set(update_data.keys()) - {"status", "escalation_target", "next_review_date"}
        if forbidden:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Management can only update risk status, escalation_target, and next_review_date.",
            )

    if "mapped_frameworks" in update_data and update_data["mapped_frameworks"] is not None:
        update_data["mapped_frameworks"] = [
            fw.model_dump() if hasattr(fw, "model_dump") else fw for fw in update_data["mapped_frameworks"]
        ]

    for field, value in update_data.items():
        setattr(risk, field, value)

    risk.severity = classify_risk_severity(int(risk.probability) * int(risk.impact))
    if risk.severity == "Critical" and prev_severity != "Critical":
        notify_critical_risk(db, risk, event_tag=str(uuid4())[:8])

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Risk Escalation" if risk.severity == "Critical" else "Mutation",
        module="Risk & Compliance",
        entity_type="Risk",
        entity_id=risk.id,
        entity_ref=risk.code,
        action=f"Updated risk '{risk.code}' (score {int(risk.probability) * int(risk.impact)} {risk.severity}, status {risk.status})",
        changes=update_data,
        request=request,
    )
    db.commit()
    db.refresh(risk)
    return serialize_risk(db, risk)


@router.post("/risks/{risk_id}/escalate", response_model=RiskOut)
def escalate_risk(
    risk_id: UUID,
    payload: RiskEscalateRequest,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor", "Management")),
    db: Session = Depends(get_db),
) -> RiskOut:
    risk = db.get(Risk, risk_id)
    if risk is None or risk.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Risk not found.")

    target = (payload.escalation_target or risk.escalation_target or "Board Audit Committee").strip()
    risk.escalation_target = target
    if risk.status == "Open":
        risk.status = "In Review"

    notify_critical_risk(
        db,
        risk,
        escalated_by=current_user,
        event_tag=str(uuid4())[:8],
        note=payload.note,
    )
    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Risk Escalation",
        module="Risk & Compliance",
        entity_type="Risk",
        entity_id=risk.id,
        entity_ref=risk.code,
        action=f"Escalated risk '{risk.code}' to {target}",
        changes={"escalation_target": target, "note": payload.note},
        request=request,
    )
    db.commit()
    db.refresh(risk)
    return serialize_risk(db, risk)
