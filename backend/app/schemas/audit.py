from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMBaseModel

AuditDomainLiteral = Literal[
    "Financial",
    "HR",
    "Technology",
    "Project",
    "Customer",
    "Operations",
    "Compliance",
]

AuditStatusLiteral = Literal[
    "Draft",
    "Scheduled",
    "In Progress",
    "Review",
    "Action Required",
    "Verification",
    "Closed",
]

ResponseValueLiteral = Literal["Pass", "Partial", "Fail", "N/A"]


class AuditScopeOut(ORMBaseModel):
    id: UUID
    audit_id: UUID
    scope_name: str
    system_or_process: str
    regulatory_clause: str | None = None
    in_scope: bool


class AuditScopeCreate(BaseModel):
    scope_name: str = Field(..., min_length=2, max_length=180)
    system_or_process: str = Field(..., min_length=2, max_length=180)
    regulatory_clause: str | None = Field(default=None, max_length=120)
    in_scope: bool = True


class AuditScopeUpdate(BaseModel):
    scope_name: str | None = Field(default=None, min_length=2, max_length=180)
    system_or_process: str | None = Field(default=None, min_length=2, max_length=180)
    regulatory_clause: str | None = Field(default=None, max_length=120)
    in_scope: bool | None = None


class AuditStageOut(BaseModel):
    name: str
    progress: int
    state: Literal["completed", "active", "pending"]


class AuditOut(ORMBaseModel):
    id: UUID
    company_id: UUID
    department_id: UUID
    department_name: str
    department_code: str
    lead_auditor_id: UUID | None = None
    lead_auditor_name: str = "Unassigned"
    lead_auditor_initials: str = "UA"
    lead_auditor_role: str = "Auditor"
    code: str
    title: str
    domain: AuditDomainLiteral
    framework: str
    status: AuditStatusLiteral
    computed_score: float | None = None
    controls_evaluated: int = 0
    controls_total: int = 0
    scheduled_start: date | None = None
    target_due_date: date | None = None
    completed_at: datetime | None = None
    summary: str | None = None
    scopes: list[AuditScopeOut] = Field(default_factory=list)
    stages: list[AuditStageOut] = Field(default_factory=list)
    allowed_next_statuses: list[AuditStatusLiteral] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class AuditCreate(BaseModel):
    code: str | None = Field(default=None, min_length=3, max_length=32)
    title: str = Field(..., min_length=3, max_length=255)
    domain: AuditDomainLiteral
    department_id: UUID
    lead_auditor_id: UUID | None = None
    framework: str = Field(..., min_length=2, max_length=150)
    status: AuditStatusLiteral = "Draft"
    scheduled_start: date | None = None
    target_due_date: date | None = None
    summary: str | None = None
    scopes: list[AuditScopeCreate] = Field(default_factory=list)


class AuditUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    department_id: UUID | None = None
    lead_auditor_id: UUID | None = None
    framework: str | None = Field(default=None, min_length=2, max_length=150)
    status: AuditStatusLiteral | None = None
    scheduled_start: date | None = None
    target_due_date: date | None = None
    summary: str | None = None


class ChecklistItemOut(ORMBaseModel):
    id: UUID
    checklist_id: UUID
    checklist_code: str = ""
    framework: str = ""
    domain: AuditDomainLiteral
    control_code: str
    title: str
    test_procedure: str
    weight: float
    display_order: int
    latest_response: ResponseValueLiteral | None = None
    latest_score_factor: float | None = None
    latest_auditor_notes: str | None = None
    latest_tested_at: datetime | None = None
    responder_name: str | None = None
    evidence_count: int = 0


class ChecklistOut(ORMBaseModel):
    id: UUID
    company_id: UUID
    code: str
    title: str
    domain: AuditDomainLiteral
    framework: str
    version: str
    is_active: bool
    items: list[ChecklistItemOut] = Field(default_factory=list)


class ChecklistCreate(BaseModel):
    code: str | None = Field(default=None, min_length=3, max_length=32)
    title: str = Field(..., min_length=3, max_length=200)
    domain: AuditDomainLiteral
    framework: str = Field(..., min_length=2, max_length=120)
    version: str = Field(default="2025.4", min_length=1, max_length=24)


class ChecklistItemCreate(BaseModel):
    control_code: str = Field(..., min_length=2, max_length=40)
    title: str = Field(..., min_length=3, max_length=255)
    test_procedure: str = Field(..., min_length=5)
    weight: float = Field(default=1.0, gt=0, le=10)
    display_order: int = Field(default=1, ge=1)


class ChecklistItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    test_procedure: str | None = Field(default=None, min_length=5)
    weight: float | None = Field(default=None, gt=0, le=10)
    display_order: int | None = Field(default=None, ge=1)


class AuditResponseOut(ORMBaseModel):
    id: UUID
    audit_id: UUID
    checklist_item_id: UUID
    control_code: str
    item_title: str
    responder_user_id: UUID | None = None
    responder_name: str | None = None
    response_value: ResponseValueLiteral
    score_factor: float | None = None
    weight: float
    auditor_notes: str | None = None
    tested_at: datetime


class AuditResponseItemInput(BaseModel):
    checklist_item_id: UUID
    response_value: ResponseValueLiteral
    auditor_notes: str | None = Field(default=None, max_length=2000)


class SubmitAuditResponsesRequest(BaseModel):
    responses: list[AuditResponseItemInput] = Field(..., min_length=1)


class SubmitAuditResponsesResult(BaseModel):
    audit_id: UUID
    audit_code: str
    computed_score: float | None
    controls_evaluated: int
    controls_total: int
    saved_count: int
    responses: list[AuditResponseOut]

