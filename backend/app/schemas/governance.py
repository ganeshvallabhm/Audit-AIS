from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMBaseModel

SeverityLiteral = Literal["Critical", "High", "Medium", "Low"]
FindingStatusLiteral = Literal["Open", "In Progress", "Verification Pending", "Overdue", "Closed"]
ActionStatusLiteral = Literal["Pending", "In Progress", "Submitted", "Verified", "Rejected"]
RiskCategoryLiteral = Literal["Technology", "Financial", "Compliance", "Operations", "Strategic", "HR"]
RiskStatusLiteral = Literal["Open", "Under Treatment", "In Review", "Mitigated", "Accepted"]
EvidenceStatusLiteral = Literal["Pending Review", "Verified", "Flagged"]


class RecommendationOut(ORMBaseModel):
    id: UUID
    finding_id: UUID
    risk_id: UUID | None = None
    author_user_id: UUID | None = None
    author_name: str | None = None
    title: str
    guidance: str
    priority: SeverityLiteral
    management_response: str | None = None
    accepted_by_management: bool
    accepted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class RecommendationCreate(BaseModel):
    finding_id: UUID
    risk_id: UUID | None = None
    title: str = Field(..., min_length=3, max_length=255)
    guidance: str = Field(..., min_length=5)
    priority: SeverityLiteral = "High"


class RecommendationRespondRequest(BaseModel):
    management_response: str = Field(..., min_length=3, max_length=4000)
    accepted_by_management: bool = True


class CorrectiveActionOut(ORMBaseModel):
    id: UUID
    company_id: UUID
    finding_id: UUID | None = None
    finding_code: str | None = None
    finding_title: str | None = None
    recommendation_id: UUID | None = None
    risk_id: UUID | None = None
    risk_code: str | None = None
    assigned_to_user_id: UUID | None = None
    assigned_to_name: str | None = None
    verified_by_user_id: UUID | None = None
    verified_by_name: str | None = None
    code: str
    step_order: int
    title: str
    detail: str | None = None
    status: ActionStatusLiteral
    progress_percent: int
    due_date: date
    completed_at: datetime | None = None
    verified_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CorrectiveActionCreate(BaseModel):
    code: str | None = Field(default=None, min_length=3, max_length=32)
    finding_id: UUID | None = None
    recommendation_id: UUID | None = None
    risk_id: UUID | None = None
    assigned_to_user_id: UUID | None = None
    step_order: int = Field(default=1, ge=1)
    title: str = Field(..., min_length=3, max_length=255)
    detail: str | None = None
    status: ActionStatusLiteral = "Pending"
    progress_percent: int = Field(default=0, ge=0, le=100)
    due_date: date


class CorrectiveActionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    detail: str | None = None
    assigned_to_user_id: UUID | None = None
    status: ActionStatusLiteral | None = None
    progress_percent: int | None = Field(default=None, ge=0, le=100)
    due_date: date | None = None


class FindingEvidenceRefOut(BaseModel):
    id: UUID
    code: str
    filename: str
    mime_type: str
    byte_size: int
    sha256_hash: str
    verification_status: EvidenceStatusLiteral
    tag: str | None = None


class FindingOut(ORMBaseModel):
    id: UUID
    company_id: UUID
    audit_id: UUID
    audit_code: str
    audit_title: str
    audit_response_id: UUID | None = None
    department_id: UUID
    department_name: str
    department_code: str
    owner_user_id: UUID | None = None
    owner_name: str = "Unassigned"
    owner_initials: str = "UA"
    lead_auditor_id: UUID | None = None
    lead_auditor_name: str = "Unassigned"
    signed_off_by_id: UUID | None = None
    signed_off_by_name: str | None = None
    code: str
    title: str
    root_cause: str
    workstream: str | None = None
    severity: SeverityLiteral
    status: FindingStatusLiteral
    target_sla_date: date
    sla_countdown: str
    is_overdue: bool
    progress_percent: int
    management_response: str | None = None
    signed_off_at: datetime | None = None
    recommendations: list[RecommendationOut] = Field(default_factory=list)
    corrective_actions: list[CorrectiveActionOut] = Field(default_factory=list)
    evidence_items: list[FindingEvidenceRefOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class FindingCreate(BaseModel):
    code: str | None = Field(default=None, min_length=3, max_length=32)
    audit_id: UUID
    audit_response_id: UUID | None = None
    department_id: UUID
    owner_user_id: UUID | None = None
    lead_auditor_id: UUID | None = None
    title: str = Field(..., min_length=3, max_length=255)
    root_cause: str = Field(..., min_length=5)
    workstream: str | None = Field(default=None, max_length=120)
    severity: SeverityLiteral
    status: FindingStatusLiteral = "Open"
    target_sla_date: date
    management_response: str | None = None


class FindingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    root_cause: str | None = Field(default=None, min_length=5)
    workstream: str | None = Field(default=None, max_length=120)
    severity: SeverityLiteral | None = None
    status: FindingStatusLiteral | None = None
    owner_user_id: UUID | None = None
    target_sla_date: date | None = None
    management_response: str | None = None
    sign_off: bool | None = None


class RiskFrameworkItem(BaseModel):
    code: str
    name: str
    description: str


class RiskOut(ORMBaseModel):
    id: UUID
    company_id: UUID
    department_id: UUID
    department_name: str
    department_code: str
    owner_user_id: UUID | None = None
    owner_name: str = "Unassigned"
    owner_initials: str = "UA"
    owner_role: str = "Risk Owner"
    linked_audit_id: UUID | None = None
    linked_audit_code: str | None = None
    code: str
    title: str
    scope_description: str
    category: RiskCategoryLiteral
    probability: int
    impact: int
    inherent_score: int
    severity: SeverityLiteral
    residual_probability: int | None = None
    residual_impact: int | None = None
    residual_score: int
    residual_level: str
    mitigation_strategy: str | None = None
    narrative: str | None = None
    affected_assets: list[str] = Field(default_factory=list)
    mapped_frameworks: list[RiskFrameworkItem] = Field(default_factory=list)
    escalation_target: str | None = None
    next_review_date: date | None = None
    status: RiskStatusLiteral
    progress_percent: int = 0
    corrective_actions: list[CorrectiveActionOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class RiskCreate(BaseModel):
    code: str | None = Field(default=None, min_length=3, max_length=32)
    department_id: UUID
    owner_user_id: UUID | None = None
    linked_audit_id: UUID | None = None
    title: str = Field(..., min_length=3, max_length=255)
    scope_description: str = Field(..., min_length=5)
    category: RiskCategoryLiteral
    probability: int = Field(..., ge=1, le=5)
    impact: int = Field(..., ge=1, le=5)
    residual_probability: int | None = Field(default=None, ge=1, le=5)
    residual_impact: int | None = Field(default=None, ge=1, le=5)
    mitigation_strategy: str | None = None
    narrative: str | None = None
    affected_assets: list[str] = Field(default_factory=list)
    mapped_frameworks: list[RiskFrameworkItem] = Field(default_factory=list)
    escalation_target: str | None = Field(default=None, max_length=120)
    next_review_date: date | None = None
    status: RiskStatusLiteral = "Open"


class RiskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    scope_description: str | None = Field(default=None, min_length=5)
    category: RiskCategoryLiteral | None = None
    probability: int | None = Field(default=None, ge=1, le=5)
    impact: int | None = Field(default=None, ge=1, le=5)
    residual_probability: int | None = Field(default=None, ge=1, le=5)
    residual_impact: int | None = Field(default=None, ge=1, le=5)
    mitigation_strategy: str | None = None
    narrative: str | None = None
    affected_assets: list[str] | None = None
    mapped_frameworks: list[RiskFrameworkItem] | None = None
    escalation_target: str | None = Field(default=None, max_length=120)
    next_review_date: date | None = None
    status: RiskStatusLiteral | None = None


class EvidenceOut(ORMBaseModel):
    id: UUID
    company_id: UUID
    audit_id: UUID | None = None
    audit_code: str | None = None
    department_name: str | None = None
    finding_id: UUID | None = None
    finding_code: str | None = None
    corrective_action_id: UUID | None = None
    checklist_item_id: UUID | None = None
    uploaded_by_user_id: UUID
    uploaded_by_name: str
    reviewed_by_user_id: UUID | None = None
    reviewed_by_name: str | None = None
    code: str
    original_filename: str
    mime_type: str
    byte_size: int
    sha256_hash: str
    verification_status: EvidenceStatusLiteral
    tag: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class EvidenceVerifyRequest(BaseModel):
    verification_status: EvidenceStatusLiteral
    verify_file_checksum: bool = True

