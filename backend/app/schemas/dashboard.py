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
    open_findings_count: int
    critical_findings_count: int
    overdue_findings_count: int
    critical_high_risks_count: int
    board_risk_threshold: int
    sla_compliance_pct: float
    performance_trend: list[PerformanceTrendPoint]
    forecast: ForecastSummary
    departments: list[DepartmentOut]
    priority_signoffs: list[FindingOut]
    risk_distribution: RiskDistributionOut


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
    event_sha256: str
    created_at: datetime


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

