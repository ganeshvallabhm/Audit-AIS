from datetime import datetime, UTC
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.deps import ensure_department_scope, get_current_user, require_roles
from app.models.audit import Audit
from app.models.core import Department, User
from app.models.governance import CorrectiveAction, Evidence, Finding, Recommendation, Risk
from app.models.telemetry import Notification
from app.schemas.common import PaginatedResponse
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
    RiskFrameworkItem,
    RiskOut,
    RiskUpdate,
)
from app.services.audit_history import record_audit_history
from app.services.scoring import classify_risk_severity, compute_initials, compute_sla_countdown

router = APIRouter(tags=["Findings, Risks & Corrective Actions"])


def serialize_action(db: Session, act: CorrectiveAction) -> CorrectiveActionOut:
    finding = db.get(Finding, act.finding_id) if act.finding_id else None
    risk = db.get(Risk, act.risk_id) if act.risk_id else None
    assignee = db.get(User, act.assigned_to_user_id) if act.assigned_to_user_id else None
    verifier = db.get(User, act.verified_by_user_id) if act.verified_by_user_id else None
    return CorrectiveActionOut(
        id=act.id,
        company_id=act.company_id,
        finding_id=act.finding_id,
        finding_code=finding.code if finding else None,
        finding_title=finding.title if finding else None,
        recommendation_id=act.recommendation_id,
        risk_id=act.risk_id,
        risk_code=risk.code if risk else None,
        assigned_to_user_id=act.assigned_to_user_id,
        assigned_to_name=assignee.full_name if assignee else None,
        verified_by_user_id=act.verified_by_user_id,
        verified_by_name=verifier.full_name if verifier else None,
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


def serialize_finding(db: Session, f: Finding) -> FindingOut:
    audit = db.get(Audit, f.audit_id)
    dept = db.get(Department, f.department_id)
    owner = db.get(User, f.owner_user_id) if f.owner_user_id else None
    lead = db.get(User, f.lead_auditor_id) if f.lead_auditor_id else None
    signer = db.get(User, f.signed_off_by_id) if f.signed_off_by_id else None

    countdown, is_overdue = compute_sla_countdown(f.target_sla_date, f.status)
    actions = f.corrective_actions
    if actions:
        progress_pct = round(sum(a.progress_percent for a in actions) / len(actions))
    else:
        progress_pct = 100 if f.status == "Closed" else (90 if f.status == "Verification Pending" else 0)

    ev_rows = db.scalars(
        select(Evidence).where(Evidence.finding_id == f.id).order_by(Evidence.created_at.desc())
    ).all()

    recs_out: list[RecommendationOut] = []
    for rec in f.recommendations:
        author = db.get(User, rec.author_user_id) if rec.author_user_id else None
        recs_out.append(
            RecommendationOut(
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
        )

    return FindingOut(
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
        signed_off_at=f.signed_off_at,
        recommendations=recs_out,
        corrective_actions=[serialize_action(db, a) for a in actions],
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
            for e in ev_rows
        ],
        created_at=f.created_at,
        updated_at=f.updated_at,
    )


def serialize_risk(db: Session, r: Risk) -> RiskOut:
    dept = db.get(Department, r.department_id)
    owner = db.get(User, r.owner_user_id) if r.owner_user_id else None
    audit = db.get(Audit, r.linked_audit_id) if r.linked_audit_id else None

    res_prob = r.residual_probability if r.residual_probability is not None else r.probability
    res_imp = r.residual_impact if r.residual_impact is not None else r.impact
    residual_score = res_prob * res_imp
    residual_sev = classify_risk_severity(residual_score)

    actions = db.scalars(
        select(CorrectiveAction).where(CorrectiveAction.risk_id == r.id).order_by(CorrectiveAction.step_order)
    ).all()
    if actions:
        progress_pct = round(sum(a.progress_percent for a in actions) / len(actions))
    else:
        progress_pct = 100 if r.status == "Mitigated" else (80 if r.status == "In Review" else 40)

    return RiskOut(
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
        corrective_actions=[serialize_action(db, a) for a in actions],
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


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
    rows = db.scalars(stmt.order_by(Finding.target_sla_date.asc()).offset(offset).limit(limit)).all()
    return PaginatedResponse(
        items=[serialize_finding(db, row) for row in rows],
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
        cnt = db.scalar(select(func.count(Finding.id)).where(Finding.company_id == current_user.company_id)) or 0
        code = f"FND-{1030 + cnt + 1}"

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

    if finding.owner_user_id:
        db.add(
            Notification(
                company_id=current_user.company_id,
                user_id=finding.owner_user_id,
                title=f"New {finding.severity} Finding Assigned: {finding.code}",
                description=finding.title,
                severity="critical" if finding.severity in {"Critical", "High"} else "warning",
                entity_type="Finding",
                entity_id=finding.id,
                target_link="/findings-and-actions",
            )
        )

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

    update_data = payload.model_dump(exclude_unset=True)

    # RBAC fine-grained checks per role
    if current_user.role == "Department Head":
        ensure_department_scope(current_user, finding.department_id)
        forbidden = set(update_data.keys()) - {"management_response"}
        if forbidden:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Department Heads can only submit management_response on findings in their department.",
            )
    elif current_user.role == "Management":
        forbidden = set(update_data.keys()) - {"management_response", "sign_off"}
        if forbidden:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Management role can only submit management_response or executive sign-off.",
            )

    if update_data.pop("sign_off", None):
        finding.signed_off_by_id = current_user.id
        finding.signed_off_at = datetime.now(UTC)
        finding.status = "Closed"

    for field, value in update_data.items():
        setattr(finding, field, value)

    category = "Sign-Off" if finding.status == "Closed" else "Mutation"
    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category=category,
        module="Findings & Actions",
        entity_type="Finding",
        entity_id=finding.id,
        entity_ref=finding.code,
        action=f"Updated finding '{finding.code}' (status: {finding.status})",
        changes={k: str(v) for k, v in payload.model_dump(exclude_unset=True).items()},
        request=request,
    )
    db.commit()
    db.refresh(finding)
    return serialize_finding(db, finding)


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
    rows = db.scalars(
        stmt.order_by(CorrectiveAction.due_date.asc(), CorrectiveAction.step_order.asc())
        .offset(offset)
        .limit(limit)
    ).all()
    return PaginatedResponse(
        items=[serialize_action(db, row) for row in rows],
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
        cnt = (
            db.scalar(
                select(func.count(CorrectiveAction.id)).where(
                    CorrectiveAction.company_id == current_user.company_id
                )
            )
            or 0
        )
        code = f"ACT-{110 + cnt + 1}"

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
    if action.finding_id:
        f = db.get(Finding, action.finding_id)
        dept_id = f.department_id if f else None
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
    rows = db.scalars(stmt.order_by(Risk.inherent_score.desc(), Risk.code).offset(offset).limit(limit)).all()
    return PaginatedResponse(
        items=[serialize_risk(db, row) for row in rows],
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
        cnt = db.scalar(select(func.count(Risk.id)).where(Risk.company_id == current_user.company_id)) or 0
        code = f"RSK-{40 + cnt + 1}"

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

    update_data = payload.model_dump(exclude_unset=True)
    if current_user.role == "Management":
        forbidden = set(update_data.keys()) - {"status", "escalation_target"}
        if forbidden:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Management can only update risk acceptance/review status and escalation_target.",
            )

    if "mapped_frameworks" in update_data and update_data["mapped_frameworks"] is not None:
        update_data["mapped_frameworks"] = [fw.model_dump() if hasattr(fw, "model_dump") else fw for fw in update_data["mapped_frameworks"]]

    for field, value in update_data.items():
        setattr(risk, field, value)

    # Always recompute authoritative server severity from probability * impact
    risk.severity = classify_risk_severity(int(risk.probability) * int(risk.impact))

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

