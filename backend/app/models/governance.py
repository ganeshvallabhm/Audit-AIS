from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.core import TimestampMixin


class Finding(TimestampMixin, Base):
    __tablename__ = "findings"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_findings_company_code"),
        CheckConstraint(
            "severity IN ('Critical', 'High', 'Medium', 'Low')",
            name="ck_findings_severity",
        ),
        CheckConstraint(
            "status IN ('Open', 'In Progress', 'Verification Pending', 'Overdue', 'Closed')",
            name="ck_findings_status",
        ),
        Index("ix_findings_company_status_sev", "company_id", "status", "severity"),
        Index("ix_findings_sla", "company_id", "target_sla_date"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    audit_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("audits.id", ondelete="CASCADE"), nullable=False
    )
    audit_response_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("audit_responses.id", ondelete="SET NULL"), nullable=True
    )
    department_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False
    )
    owner_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    lead_auditor_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    signed_off_by_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    root_cause: Mapped[str] = mapped_column(Text, nullable=False)
    workstream: Mapped[str | None] = mapped_column(String(120), nullable=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Open")
    target_sla_date: Mapped[date] = mapped_column(Date, nullable=False)
    management_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    signed_off_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    audit = relationship("Audit")
    department = relationship("Department")
    owner = relationship("User", foreign_keys=[owner_user_id])
    lead_auditor = relationship("User", foreign_keys=[lead_auditor_id])
    signed_off_by = relationship("User", foreign_keys=[signed_off_by_id])
    recommendations: Mapped[list["Recommendation"]] = relationship(
        back_populates="finding", cascade="all, delete-orphan"
    )
    corrective_actions: Mapped[list["CorrectiveAction"]] = relationship(
        back_populates="finding", cascade="all, delete-orphan", order_by="CorrectiveAction.step_order"
    )


class Risk(TimestampMixin, Base):
    __tablename__ = "risks"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_risks_company_code"),
        CheckConstraint(
            "category IN ('Technology', 'Financial', 'Compliance', 'Operations', 'Strategic', 'HR')",
            name="ck_risks_category",
        ),
        CheckConstraint("probability BETWEEN 1 AND 5", name="ck_risks_probability_range"),
        CheckConstraint("impact BETWEEN 1 AND 5", name="ck_risks_impact_range"),
        CheckConstraint(
            "residual_probability IS NULL OR (residual_probability BETWEEN 1 AND 5)",
            name="ck_risks_res_prob_range",
        ),
        CheckConstraint(
            "residual_impact IS NULL OR (residual_impact BETWEEN 1 AND 5)",
            name="ck_risks_res_imp_range",
        ),
        CheckConstraint(
            "severity IN ('Low', 'Medium', 'High', 'Critical')",
            name="ck_risks_severity",
        ),
        CheckConstraint(
            "status IN ('Open', 'Under Treatment', 'In Review', 'Mitigated', 'Accepted')",
            name="ck_risks_status",
        ),
        Index("ix_risks_matrix", "company_id", "probability", "impact"),
        Index("ix_risks_severity", "company_id", "severity", "status"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    department_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False
    )
    owner_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    linked_audit_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("audits.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    scope_description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    probability: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    impact: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    inherent_score: Mapped[int] = mapped_column(
        SmallInteger, Computed("probability * impact", persisted=True), nullable=False
    )
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    residual_probability: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    residual_impact: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    mitigation_strategy: Mapped[str | None] = mapped_column(Text, nullable=True)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    affected_assets: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    mapped_frameworks: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    escalation_target: Mapped[str | None] = mapped_column(String(120), nullable=True)
    next_review_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Open")

    department = relationship("Department")
    owner = relationship("User", foreign_keys=[owner_user_id])
    linked_audit = relationship("Audit", foreign_keys=[linked_audit_id])


class Recommendation(TimestampMixin, Base):
    __tablename__ = "recommendations"
    __table_args__ = (
        CheckConstraint(
            "priority IN ('Critical', 'High', 'Medium', 'Low')",
            name="ck_recommendations_priority",
        ),
        Index("ix_recommendations_finding", "company_id", "finding_id"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    finding_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("findings.id", ondelete="CASCADE"), nullable=False
    )
    risk_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("risks.id", ondelete="SET NULL"), nullable=True
    )
    author_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    guidance: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String(16), nullable=False)
    management_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    accepted_by_management: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    finding: Mapped["Finding"] = relationship(back_populates="recommendations")
    risk = relationship("Risk")
    author = relationship("User", foreign_keys=[author_user_id])


class CorrectiveAction(TimestampMixin, Base):
    __tablename__ = "corrective_actions"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_corrective_actions_company_code"),
        CheckConstraint(
            "finding_id IS NOT NULL OR risk_id IS NOT NULL",
            name="ck_corrective_actions_parent_required",
        ),
        CheckConstraint("step_order >= 1", name="ck_corrective_actions_step_pos"),
        CheckConstraint(
            "status IN ('Pending', 'In Progress', 'Submitted', 'Verified', 'Rejected')",
            name="ck_corrective_actions_status",
        ),
        CheckConstraint(
            "progress_percent BETWEEN 0 AND 100",
            name="ck_corrective_actions_progress_range",
        ),
        Index("ix_actions_assignee_due", "company_id", "assigned_to_user_id", "due_date"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    finding_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("findings.id", ondelete="CASCADE"), nullable=True
    )
    recommendation_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("recommendations.id", ondelete="SET NULL"), nullable=True
    )
    risk_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("risks.id", ondelete="SET NULL"), nullable=True
    )
    assigned_to_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_by_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="Pending")
    progress_percent: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    finding: Mapped["Finding | None"] = relationship(back_populates="corrective_actions")
    recommendation = relationship("Recommendation")
    risk = relationship("Risk")
    assigned_to = relationship("User", foreign_keys=[assigned_to_user_id])
    verified_by = relationship("User", foreign_keys=[verified_by_user_id])


class Evidence(TimestampMixin, Base):
    __tablename__ = "evidence"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_evidence_company_code"),
        CheckConstraint("byte_size > 0 AND byte_size <= 26214400", name="ck_evidence_size_cap"),
        CheckConstraint("sha256_hash ~ '^[0-9a-f]{64}$'", name="ck_evidence_sha256_hex"),
        CheckConstraint(
            "verification_status IN ('Pending Review', 'Verified', 'Flagged')",
            name="ck_evidence_status",
        ),
        Index("ix_evidence_audit_finding", "company_id", "audit_id", "finding_id"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    audit_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("audits.id", ondelete="SET NULL"), nullable=True
    )
    finding_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("findings.id", ondelete="SET NULL"), nullable=True
    )
    corrective_action_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("corrective_actions.id", ondelete="SET NULL"), nullable=True
    )
    checklist_item_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("checklist_items.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_by_user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    reviewed_by_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    verification_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="Pending Review"
    )
    tag: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    audit = relationship("Audit")
    finding = relationship("Finding")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])

