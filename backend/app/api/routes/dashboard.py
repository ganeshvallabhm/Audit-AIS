from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.analytics.forecasting import build_performance_trend_and_forecast
from app.analytics.reporting import (
    build_report_detail,
    generate_grounded_ai_synthesis,
    generate_report_export,
    get_report_suites,
)
from app.analytics.scoring_analytics import (
    build_company_overview_numbers,
    compute_risk_distribution,
)
from app.api.routes.company import serialize_departments
from app.api.routes.governance import serialize_findings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.rate_limit import client_rate_key, rate_limiter
from app.models.audit import Audit, ChecklistItem
from app.models.core import Company, Department, User
from app.models.domains import Customer, Employee, FinancialMetric, Project
from app.models.governance import DistributionRule, Evidence, Finding, Risk
from app.models.telemetry import AuditHistory, Notification
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.company import DepartmentOut
from app.schemas.dashboard import (
    AiSynthesisRequest,
    AiSynthesisResponse,
    AuditHistoryOut,
    AuditHistoryVerifyOut,
    CustomerAssuranceOut,
    DashboardOverviewOut,
    DomainTelemetryOut,
    EmployeeComplianceOut,
    EvidenceBreakdownOut,
    FinancialMetricOut,
    FrameworkComplianceOut,
    GlobalSearchResponse,
    NotificationOut,
    ProjectOut,
    ProjectTaskOut,
    ReportDetailOut,
    ReportSuiteOut,
    RiskDistributionOut,
    SearchResultItem,
    SlaSweepResultOut,
)
from app.schemas.governance import (
    DistributionRuleCreate,
    DistributionRuleOut,
    DistributionRuleUpdate,
)
from app.services.audit_history import record_audit_history, verify_company_history_chain
from app.services.notifications import run_company_sla_sweep

router = APIRouter(tags=["Dashboard, Analytics, Reports & Telemetry"])


@router.get("/dashboard", response_model=DashboardOverviewOut)
def get_dashboard_overview(
    period: str = Query(default="Q4 2025"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    department_id: UUID | None = Query(default=None),
    domain: str | None = Query(default=None),
    audit_status: str | None = Query(default=None),
    risk_severity: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardOverviewOut:
    company = db.get(Company, current_user.company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    numbers = build_company_overview_numbers(
        db,
        company,
        period=period,
        date_from=date_from,
        date_to=date_to,
        department_id=department_id,
        domain=domain,
        audit_status=audit_status,
        risk_severity=risk_severity,
    )
    d_from, d_to = numbers["date_bounds"]
    trend, forecast = build_performance_trend_and_forecast(
        db,
        company.id,
        live_composite_score=numbers["composite_score"],
        enterprise_target=float(company.enterprise_target_score),
        period=period,
        department_id=department_id,
        domain=domain,
        audit_status=audit_status,
        d_from=d_from,
        d_to=d_to,
    )

    depts_out = serialize_departments(db, numbers["departments"], numbers["dept_metrics"])

    priority_stmt = (
        select(Finding)
        .options(selectinload(Finding.recommendations), selectinload(Finding.corrective_actions))
        .where(Finding.company_id == company.id, Finding.status != "Closed")
    )
    if department_id is not None:
        priority_stmt = priority_stmt.where(Finding.department_id == department_id)
    if numbers["filtered_finding_ids"] or department_id or domain or d_from or d_to:
        if numbers["filtered_finding_ids"]:
            priority_stmt = priority_stmt.where(Finding.id.in_(numbers["filtered_finding_ids"]))
        else:
            priority_stmt = priority_stmt.where(Finding.id.is_(None))

    priority_rows = list(db.scalars(priority_stmt.order_by(Finding.target_sla_date.asc()).limit(6)).all())

    return DashboardOverviewOut(
        company_name=company.legal_name,
        fiscal_year=company.fiscal_year_label,
        period=period,
        composite_score=numbers["composite_score"],
        enterprise_target=float(company.enterprise_target_score),
        minimum_floor=float(company.minimum_composite_floor),
        active_audits_count=numbers["active_audits_count"],
        completed_audits_count=numbers["completed_audits_count"],
        total_audits_count=numbers["total_audits_count"],
        audit_completion_rate_pct=numbers["audit_completion_rate_pct"],
        open_findings_count=numbers["open_findings_count"],
        critical_findings_count=numbers["critical_findings_count"],
        overdue_findings_count=numbers["overdue_findings_count"],
        overdue_actions_count=numbers["overdue_actions_count"],
        critical_high_risks_count=numbers["critical_high_risks_count"],
        board_risk_threshold=company.board_risk_threshold,
        sla_compliance_pct=numbers["sla_compliance_pct"],
        performance_trend=trend,  # type: ignore[arg-type]
        forecast=forecast,  # type: ignore[arg-type]
        departments=depts_out,
        priority_signoffs=serialize_findings(db, priority_rows),
        risk_distribution=RiskDistributionOut(**numbers["risk_distribution"]),
        framework_compliance=[FrameworkComplianceOut(**fw) for fw in numbers["framework_compliance"]],
        evidence_breakdown=EvidenceBreakdownOut(**numbers["evidence_breakdown"]),
        kpi_methodology=numbers["kpi_methodology"],
    )


@router.get("/dashboard/department-performance", response_model=list[DepartmentOut])
def get_department_performance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DepartmentOut]:
    company = db.get(Company, current_user.company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    numbers = build_company_overview_numbers(db, company)
    return serialize_departments(db, numbers["departments"], numbers["dept_metrics"])


@router.get("/dashboard/risk-distribution", response_model=RiskDistributionOut)
def get_risk_distribution(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RiskDistributionOut:
    return RiskDistributionOut(**compute_risk_distribution(db, current_user.company_id))


@router.get("/search", response_model=GlobalSearchResponse)
def global_search(
    q: str = Query(..., min_length=1, max_length=120),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GlobalSearchResponse:
    pattern = f"%{q.strip()}%"
    results: list[SearchResultItem] = []

    audits = db.scalars(
        select(Audit)
        .where(
            Audit.company_id == current_user.company_id,
            or_(Audit.code.ilike(pattern), Audit.title.ilike(pattern), Audit.framework.ilike(pattern)),
        )
        .limit(6)
    ).all()
    for a in audits:
        results.append(
            SearchResultItem(
                entity_type="Audit",
                entity_id=a.id,
                code=a.code,
                title=a.title,
                subtitle=f"{a.domain} • {a.framework}",
                status=a.status,
                route="/audits",
            )
        )

    findings = db.scalars(
        select(Finding)
        .where(
            Finding.company_id == current_user.company_id,
            or_(Finding.code.ilike(pattern), Finding.title.ilike(pattern), Finding.root_cause.ilike(pattern)),
        )
        .limit(6)
    ).all()
    for f in findings:
        results.append(
            SearchResultItem(
                entity_type="Finding",
                entity_id=f.id,
                code=f.code,
                title=f.title,
                subtitle=f"Severity: {f.severity} • SLA {f.target_sla_date}",
                status=f.status,
                route="/findings-and-actions",
            )
        )

    risks = db.scalars(
        select(Risk)
        .where(
            Risk.company_id == current_user.company_id,
            or_(Risk.code.ilike(pattern), Risk.title.ilike(pattern), Risk.scope_description.ilike(pattern)),
        )
        .limit(6)
    ).all()
    for r in risks:
        results.append(
            SearchResultItem(
                entity_type="Risk",
                entity_id=r.id,
                code=r.code,
                title=r.title,
                subtitle=f"{r.category} • Inherent Score {r.inherent_score} ({r.severity})",
                status=r.status,
                route="/risk-and-compliance",
            )
        )

    evidence = db.scalars(
        select(Evidence)
        .where(
            Evidence.company_id == current_user.company_id,
            or_(Evidence.code.ilike(pattern), Evidence.original_filename.ilike(pattern), Evidence.tag.ilike(pattern)),
        )
        .limit(4)
    ).all()
    for ev in evidence:
        results.append(
            SearchResultItem(
                entity_type="Evidence",
                entity_id=ev.id,
                code=ev.code,
                title=ev.original_filename,
                subtitle=f"SHA-256: {ev.sha256_hash[:12]}...",
                status=ev.verification_status,
                route="/audits/evidence",
            )
        )

    controls = db.scalars(
        select(ChecklistItem)
        .where(
            ChecklistItem.company_id == current_user.company_id,
            or_(ChecklistItem.control_code.ilike(pattern), ChecklistItem.title.ilike(pattern)),
        )
        .limit(4)
    ).all()
    for ctrl in controls:
        results.append(
            SearchResultItem(
                entity_type="Control",
                entity_id=ctrl.id,
                code=ctrl.control_code,
                title=ctrl.title,
                subtitle="Audit Control Procedure",
                status="Active",
                route="/audits/checklists",
            )
        )

    return GlobalSearchResponse(query=q.strip(), total=len(results), results=results)


# ==================== REPORTS, EXPORTS, DISTRIBUTIONS & AI ASSISTANT ====================


@router.get("/reports", response_model=list[ReportSuiteOut])
def list_reports(
    current_user: User = Depends(get_current_user),
) -> list[ReportSuiteOut]:
    return [ReportSuiteOut(**s) for s in get_report_suites()]


@router.get("/reports/distributions", response_model=list[DistributionRuleOut])
def list_distribution_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DistributionRule]:
    return list(
        db.scalars(
            select(DistributionRule)
            .where(DistributionRule.company_id == current_user.company_id)
            .order_by(DistributionRule.created_at.desc())
        ).all()
    )


@router.post("/reports/distributions", response_model=DistributionRuleOut, status_code=status.HTTP_201_CREATED)
def create_distribution_rule(
    payload: DistributionRuleCreate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor", "Management")),
    db: Session = Depends(get_db),
) -> DistributionRule:
    rule = DistributionRule(
        company_id=current_user.company_id,
        created_by_user_id=current_user.id,
        name=payload.name.strip(),
        schedule_label=payload.schedule_label.strip(),
        recipients=payload.recipients.strip(),
        report_suite_id=payload.report_suite_id.strip(),
        export_format=payload.export_format,
        icon=payload.icon,
        is_active=payload.is_active,
    )
    db.add(rule)
    db.flush()

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Governance Reports",
        entity_type="DistributionRule",
        entity_id=rule.id,
        entity_ref=rule.report_suite_id,
        action=f"Configured report distribution rule '{rule.name}' ({rule.schedule_label})",
        changes={"recipients": rule.recipients, "export_format": rule.export_format},
        request=request,
    )
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/reports/distributions/{rule_id}", response_model=DistributionRuleOut)
def update_distribution_rule(
    rule_id: UUID,
    payload: DistributionRuleUpdate,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor", "Management")),
    db: Session = Depends(get_db),
) -> DistributionRule:
    rule = db.get(DistributionRule, rule_id)
    if rule is None or rule.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Distribution rule not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)

    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Governance Reports",
        entity_type="DistributionRule",
        entity_id=rule.id,
        entity_ref=rule.report_suite_id,
        action=f"Updated distribution rule '{rule.name}'",
        changes=update_data,
        request=request,
    )
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/reports/distributions/{rule_id}", response_model=MessageResponse)
def delete_distribution_rule(
    rule_id: UUID,
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor", "Management")),
    db: Session = Depends(get_db),
) -> MessageResponse:
    rule = db.get(DistributionRule, rule_id)
    if rule is None or rule.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Distribution rule not found.")

    r_name = rule.name
    record_audit_history(
        db,
        company_id=current_user.company_id,
        actor=current_user,
        category="Mutation",
        module="Governance Reports",
        entity_type="DistributionRule",
        entity_id=rule.id,
        entity_ref=rule.report_suite_id,
        action=f"Deleted report distribution rule '{r_name}'",
        request=request,
    )
    db.delete(rule)
    db.commit()
    return MessageResponse(detail=f"Distribution rule '{r_name}' deleted.")


@router.post("/reports/ai-synthesis", response_model=AiSynthesisResponse)
def run_ai_synthesis(
    payload: AiSynthesisRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AiSynthesisResponse:
    rate_limiter.check(client_rate_key(request, "ai_synthesis"), max_requests=15, window_seconds=60)
    company = db.get(Company, current_user.company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    result = generate_grounded_ai_synthesis(
        db,
        company,
        current_user,
        payload.prompt,
        domain=payload.domain,
        request=request,
    )
    db.commit()
    return AiSynthesisResponse(**result)


@router.get("/reports/{report_id}/export")
def export_report(
    report_id: str,
    format: Literal["csv", "xlsx", "pdf"] = Query(default="pdf"),
    period: str = Query(default="Q4 2025"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    company = db.get(Company, current_user.company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    raw_bytes, media_type, filename = generate_report_export(
        db,
        company,
        report_id,
        format,
        period=period,
    )
    return Response(
        content=raw_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/reports/{report_id}", response_model=ReportDetailOut)
def get_report(
    report_id: str,
    period: str = Query(default="Q4 2025"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportDetailOut:
    company = db.get(Company, current_user.company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")
    detail = build_report_detail(db, company, report_id, period=period)
    return ReportDetailOut(**{k: v for k, v in detail.items() if not k.startswith("_")})


# ==================== NOTIFICATIONS ====================


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    unread_only: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Notification]:
    stmt = select(Notification).where(
        Notification.company_id == current_user.company_id,
        Notification.user_id == current_user.id,
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    return list(db.scalars(stmt.order_by(Notification.created_at.desc()).limit(50)).all())


@router.put("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Notification:
    notif = db.get(Notification, notification_id)
    if (
        notif is None
        or notif.company_id != current_user.company_id
        or notif.user_id != current_user.id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")

    notif.is_read = True
    notif.read_at = datetime.now(UTC)
    db.commit()
    db.refresh(notif)
    return notif


@router.put("/notifications/read-all", response_model=MessageResponse)
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    now = datetime.now(UTC)
    rows = db.scalars(
        select(Notification).where(
            Notification.company_id == current_user.company_id,
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
    ).all()
    for row in rows:
        row.is_read = True
        row.read_at = now
    db.commit()
    return MessageResponse(detail=f"Marked {len(rows)} notification(s) as read.")


@router.post("/notifications/run-sla-sweep", response_model=SlaSweepResultOut)
def trigger_manual_sla_sweep(
    request: Request,
    current_user: User = Depends(require_roles("Admin", "Auditor")),
    db: Session = Depends(get_db),
) -> SlaSweepResultOut:
    rate_limiter.check(client_rate_key(request, "sla_sweep"), max_requests=10, window_seconds=60)
    company = db.get(Company, current_user.company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found.")

    summary = run_company_sla_sweep(db, company, actor=current_user)
    db.commit()
    return SlaSweepResultOut(**summary)


# ==================== AUDIT HISTORY ====================


@router.get("/history", response_model=PaginatedResponse[AuditHistoryOut])
def list_audit_history(
    category: str | None = Query(default=None),
    module: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[AuditHistoryOut]:
    stmt = select(AuditHistory).where(AuditHistory.company_id == current_user.company_id)
    if category:
        stmt = stmt.where(AuditHistory.category == category)
    if module:
        stmt = stmt.where(AuditHistory.module == module)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                AuditHistory.actor_label.ilike(pattern),
                AuditHistory.entity_ref.ilike(pattern),
                AuditHistory.action.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(AuditHistory.created_at.desc()).offset(offset).limit(limit)).all()
    return PaginatedResponse(
        items=[AuditHistoryOut.model_validate(r) for r in rows],
        total=int(total),
        limit=limit,
        offset=offset,
    )


@router.get("/history/verify", response_model=AuditHistoryVerifyOut)
def verify_audit_history_ledger(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditHistoryVerifyOut:
    return AuditHistoryVerifyOut(**verify_company_history_chain(db, current_user.company_id))


# ==================== DOMAIN TELEMETRY ====================


@router.get("/domains/{domain}/telemetry", response_model=DomainTelemetryOut)
def get_domain_telemetry(
    domain: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DomainTelemetryOut:
    normalized = domain.strip().lower()
    depts_map = {
        d.id: d.name
        for d in db.scalars(select(Department).where(Department.company_id == current_user.company_id)).all()
    }

    financial_metrics: list[FinancialMetricOut] = []
    employees_out: list[EmployeeComplianceOut] = []
    projects_out: list[ProjectOut] = []
    customers_out: list[CustomerAssuranceOut] = []
    summary_kpis: dict = {}

    if normalized in {"financial", "all"}:
        rows = db.scalars(
            select(FinancialMetric).where(FinancialMetric.company_id == current_user.company_id)
        ).all()
        financial_metrics = [
            FinancialMetricOut(
                id=m.id,
                department_id=m.department_id,
                fiscal_period=m.fiscal_period,
                metric_code=m.metric_code,
                metric_name=m.metric_name,
                currency=m.currency,
                reported_amount=float(m.reported_amount),
                budget_amount=float(m.budget_amount) if m.budget_amount is not None else None,
                variance_pct=float(m.variance_pct) if m.variance_pct is not None else None,
                sox_control_verified=m.sox_control_verified,
                recorded_at=m.recorded_at,
            )
            for m in rows
        ]
        summary_kpis["sox_verified_metrics"] = sum(1 for m in rows if m.sox_control_verified)
        summary_kpis["total_financial_metrics"] = len(rows)

    if normalized in {"hr", "all"}:
        rows = db.scalars(select(Employee).where(Employee.company_id == current_user.company_id)).all()
        employees_out = [
            EmployeeComplianceOut(
                id=e.id,
                department_id=e.department_id,
                department_name=depts_map.get(e.department_id, "Unknown"),
                employee_code=e.employee_code,
                full_name=e.full_name,
                role_title=e.role_title,
                background_check_verified=e.background_check_verified,
                security_training_completed=e.security_training_completed,
                training_completed_at=e.training_completed_at,
                employment_status=e.employment_status,
                hired_at=e.hired_at,
            )
            for e in rows
        ]
        summary_kpis["training_completed_count"] = sum(1 for e in rows if e.security_training_completed)
        summary_kpis["total_employees_sampled"] = len(rows)

    if normalized in {"project", "technology", "operations", "all"}:
        rows = db.scalars(
            select(Project)
            .options(selectinload(Project.tasks))
            .where(Project.company_id == current_user.company_id)
        ).all()
        projects_out = [
            ProjectOut(
                id=p.id,
                department_id=p.department_id,
                department_name=depts_map.get(p.department_id, "Unknown"),
                code=p.code,
                name=p.name,
                budget_amount=float(p.budget_amount),
                actual_spend=float(p.actual_spend),
                status=p.status,
                start_date=p.start_date,
                target_end_date=p.target_end_date,
                tasks=[ProjectTaskOut.model_validate(t) for t in p.tasks],
            )
            for p in rows
        ]
        summary_kpis["active_projects"] = len(rows)

    if normalized in {"customer", "compliance", "all"}:
        rows = db.scalars(select(Customer).where(Customer.company_id == current_user.company_id)).all()
        customers_out = [
            CustomerAssuranceOut(
                id=c.id,
                account_code=c.account_code,
                organization_name=c.organization_name,
                region=c.region,
                tier=c.tier,
                dpa_signed=c.dpa_signed,
                dsar_requests_open=c.dsar_requests_open,
                sla_compliance_pct=float(c.sla_compliance_pct),
                satisfaction_score=float(c.satisfaction_score) if c.satisfaction_score is not None else None,
            )
            for c in rows
        ]
        summary_kpis["dpa_signed_accounts"] = sum(1 for c in rows if c.dpa_signed)
        summary_kpis["open_dsar_requests"] = sum(c.dsar_requests_open for c in rows)

    return DomainTelemetryOut(
        domain=domain,
        summary_kpis=summary_kpis,
        financial_metrics=financial_metrics,
        employees=employees_out,
        projects=projects_out,
        customers=customers_out,
    )
