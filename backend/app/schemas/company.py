from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMBaseModel


class CompanyProfileOut(ORMBaseModel):
    id: UUID
    legal_name: str
    ticker: str | None = None
    headquarters: str | None = None
    fiscal_year_label: str
    audit_committee_chair: str | None = None
    external_auditor: str | None = None
    regulatory_scope: list[str] = Field(default_factory=list)
    enterprise_target_score: float
    minimum_composite_floor: float
    board_risk_threshold: int
    digest_frequency: str
    sla_auto_escalate: bool
    ai_citation_strict: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CompanyProfileUpdate(BaseModel):
    legal_name: str | None = Field(default=None, min_length=2, max_length=255)
    ticker: str | None = Field(default=None, max_length=32)
    headquarters: str | None = Field(default=None, max_length=255)
    fiscal_year_label: str | None = Field(default=None, min_length=2, max_length=64)
    audit_committee_chair: str | None = Field(default=None, max_length=150)
    external_auditor: str | None = Field(default=None, max_length=150)
    regulatory_scope: list[str] | None = None
    enterprise_target_score: float | None = Field(default=None, ge=0, le=100)
    minimum_composite_floor: float | None = Field(default=None, ge=0, le=100)
    board_risk_threshold: int | None = Field(default=None, ge=1, le=50)
    digest_frequency: str | None = Field(default=None, max_length=64)
    sla_auto_escalate: bool | None = None
    ai_citation_strict: bool | None = None


class DepartmentOut(ORMBaseModel):
    id: UUID
    company_id: UUID
    head_user_id: UUID | None = None
    head_name: str | None = None
    code: str
    name: str
    target_score: float
    scoring_weight: float
    attention_note: str | None = None
    score: float | None = None
    active_audits: int = 0
    open_findings: int = 0
    risk_count: int = 0
    attention_area: bool = False
    created_at: datetime
    updated_at: datetime


class DepartmentCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=32, pattern=r"^[A-Za-z0-9\-_]+$")
    name: str = Field(..., min_length=2, max_length=150)
    head_user_id: UUID | None = None
    target_score: float = Field(default=85.0, ge=0, le=100)
    scoring_weight: float = Field(default=0.125, gt=0, le=1)
    attention_note: str | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    head_user_id: UUID | None = None
    target_score: float | None = Field(default=None, ge=0, le=100)
    scoring_weight: float | None = Field(default=None, gt=0, le=1)
    attention_note: str | None = None

