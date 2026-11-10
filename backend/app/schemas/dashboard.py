from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMBaseModel
from app.schemas.company import DepartmentOut
from app.schemas.governance import FindingOut


class PerformanceTrendPoint(BaseModel):
    month: str
    actual: float
    target: float
    baseline: float
    predicted: float | None = None
    audited_controls_count: int = 0


class ForecastSummary(BaseModel):
    slope_per_month: float
    intercept: float
    r_squared: float
    current_score: float
    target_score: float
    projected_next_month: float
    predicted_months_to_target: float | None = None
    predicted_days_ahead_or_behind: int
    confidence_label: str
    data_points_count: int = 0
    is_sufficient_for_forecast: bool = False
    methodology_note: str = ""


class FrameworkComplianceOut(BaseModel):
    framework: str
    controls_total: int
    controls_evaluated: int
    score: float
    status: Literal["Compliant", "Monitor", "Needs Attention", "Not Evaluated"]


class EvidenceBreakdownOut(BaseModel):
    total: int
    verified: int
    pending_review: int
    flagged: int


class RiskMatrixCell(BaseModel):
    probability: int
    impact: int
    score: int
    severity: Literal["Low", "Medium", "High", "Critical"]
    count: int
    risk_codes: list[str] = Field(default_factory=list)


class RiskDistributionOut(BaseModel):
    total_risks: int
    by_severity: dict[str, int]
    by_category: dict[str, int]
    by_status: dict[str, int]
    matrix: list[RiskMatrixCell]


class DashboardOverviewOut(BaseModel):
    company_name: str
    fiscal_year: str
    period: str
    composite_score: float
    enterprise_target: float
    minimum_floor: float
    active_audits_count: int
    completed_audits_count: int
    total_audits_count: int
    audit_completion_rate_pct: float = 0.0
    open_findings_count: int
    critical_findings_count: int
    overdue_findings_count: int
    overdue_actions_count: int = 0
    critical_high_risks_count: int
    board_risk_threshold: int
    sla_compliance_pct: float
    performance_trend: list[PerformanceTrendPoint]
    forecast: ForecastSummary
    departments: list[DepartmentOut]
    priority_signoffs: list[FindingOut]
    risk_distribution: RiskDistributionOut
    framework_compliance: list[FrameworkComplianceOut] = Field(default_factory=list)
    evidence_breakdown: EvidenceBreakdownOut = Field(
        default_factory=lambda: EvidenceBreakdownOut(total=0, verified=0, pending_review=0, flagged=0)
    )
    kpi_methodology: dict[str, str] = Field(default_factory=dict)


class NotificationOut(ORMBaseModel):
    id: UUID
    company_id: UUID
    user_id: UUID
    title: str
    description: str
    severity: Literal["critical", "warning", "info"]
    is_read: bool
    read_at: datetime | None = None
    entity_type: str | None = None
    entity_id: UUID | None = None
    target_link: str | None = None
    created_at: datetime


class AuditHistoryOut(ORMBaseModel):
    id: UUID
    company_id: UUID
    actor_user_id: UUID | None = None
    actor_label: str
    actor_role: str
    category: str
    module: str
    entity_type: str
    entity_id: UUID
    entity_ref: str
    action: str
    changes_json: dict[str, Any] = Field(default_factory=dict)
    ip_address: str | None = None
    prev_event_sha256: str | None = None
    event_sha256: str
    created_at: datetime


class AuditHistoryVerifyOut(BaseModel):
    valid: bool
    total_events: int
    checked_events: int
    broken_event_ids: list[UUID] = Field(default_factory=list)
    genesis_ok: bool
    latest_event_sha256: str | None = None
    verified_at: datetime
    verification_note: str


class SlaSweepResultOut(BaseModel):
    notifications_created: int
    overdue_audits: int
    overdue_actions: int
    upcoming_deadlines: int
    critical_risks: int
    ran_at: datetime


class ReportSuiteOut(BaseModel):
    id: str
    title: str
    description: str
    updated_at: str
    on_demand: bool = False
    tags: list[str]
    format_tag: str
    icon: str
    primary_action: str
    secondary_action: str


class ReportDetailOut(BaseModel):
    id: str
    title: str
    generated_at: datetime
    company_name: str
    fiscal_year: str
    executive_summary: str
    kpis: dict[str, Any]
    sections: list[dict[str, Any]]
    csv_headers: list[str]
    csv_rows: list[list[str | int | float]]


class AiSynthesisRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)
    domain: str | None = None


class AiCitation(BaseModel):
    entity_type: str
    entity_ref: str
    label: str
    route: str


class AiSynthesisResponse(BaseModel):
    answer: str
    verified_facts: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    provider_status: Literal["unavailable", "configured", "live_llm"] = "unavailable"
    provider_name: str = "PostgreSQL Telemetry Synthesizer (No External LLM Configured)"
    provider_message: str = ""
    scoped_department: str | None = None
    citations: list[AiCitation]
    metrics_snapshot: dict[str, Any]
    generated_at: datetime


class SearchResultItem(BaseModel):
    entity_type: str
    entity_id: UUID
    code: str
    title: str
    subtitle: str
    status: str
    route: str


class GlobalSearchResponse(BaseModel):
    query: str
    total: int
    results: list[SearchResultItem]


class ProjectTaskOut(ORMBaseModel):
    id: UUID
    project_id: UUID
    title: str
    stage_gate: str | None = None
    status: str
    due_date: date | None = None
    sla_breached: bool


class ProjectOut(ORMBaseModel):
    id: UUID
    department_id: UUID
    department_name: str
    code: str
    name: str
    budget_amount: float
    actual_spend: float
    status: str
    start_date: date | None = None
    target_end_date: date | None = None
    tasks: list[ProjectTaskOut] = Field(default_factory=list)


class EmployeeComplianceOut(ORMBaseModel):
    id: UUID
    department_id: UUID
    department_name: str
    employee_code: str
    full_name: str
    role_title: str | None = None
    background_check_verified: bool
    security_training_completed: bool
    training_completed_at: date | None = None
    employment_status: str
    hired_at: date | None = None


class CustomerAssuranceOut(ORMBaseModel):
    id: UUID
    account_code: str
    organization_name: str
    region: str
    tier: str
    dpa_signed: bool
    dsar_requests_open: int
    sla_compliance_pct: float
    satisfaction_score: float | None = None


class FinancialMetricOut(ORMBaseModel):
    id: UUID
    department_id: UUID | None = None
    fiscal_period: str
    metric_code: str
    metric_name: str
    currency: str
    reported_amount: float
    budget_amount: float | None = None
    variance_pct: float | None = None
    sox_control_verified: bool
    recorded_at: datetime


class DomainTelemetryOut(BaseModel):
    domain: str
    summary_kpis: dict[str, Any]
    financial_metrics: list[FinancialMetricOut] = Field(default_factory=list)
    employees: list[EmployeeComplianceOut] = Field(default_factory=list)
    projects: list[ProjectOut] = Field(default_factory=list)
    customers: list[CustomerAssuranceOut] = Field(default_factory=list)

