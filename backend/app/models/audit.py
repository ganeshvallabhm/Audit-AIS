from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.core import TimestampMixin


class Audit(TimestampMixin, Base):
    __tablename__ = "audits"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_audits_company_code"),
        CheckConstraint(
            "domain IN ('Financial', 'HR', 'Technology', 'Project', 'Customer', 'Operations', 'Compliance')",
            name="ck_audits_valid_domain",
        ),
        CheckConstraint(
            "status IN ('Draft', 'Scheduled', 'In Progress', 'Review', 'Action Required', 'Verification', 'Closed')",
            name="ck_audits_valid_status",
        ),
        CheckConstraint(
            "computed_score IS NULL OR (computed_score >= 0 AND computed_score <= 100)",
            name="ck_audits_score_range",
        ),
        Index("ix_audits_company_domain_status", "company_id", "domain", "status"),
        Index("ix_audits_lead", "company_id", "lead_auditor_id"),
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
    lead_auditor_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(32), nullable=False)
    framework: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Draft")
    computed_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    scheduled_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    department = relationship("Department")
    lead_auditor = relationship("User", foreign_keys=[lead_auditor_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    scopes: Mapped[list["AuditScope"]] = relationship(
        back_populates="audit", cascade="all, delete-orphan"
    )
    responses: Mapped[list["AuditResponse"]] = relationship(
        back_populates="audit", cascade="all, delete-orphan"
    )


class AuditScope(TimestampMixin, Base):
    __tablename__ = "audit_scopes"
    __table_args__ = (Index("ix_audit_scopes_audit", "company_id", "audit_id"),)

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    audit_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("audits.id", ondelete="CASCADE"), nullable=False
    )
    scope_name: Mapped[str] = mapped_column(String(180), nullable=False)
    system_or_process: Mapped[str] = mapped_column(String(180), nullable=False)
    regulatory_clause: Mapped[str | None] = mapped_column(String(120), nullable=True)
    in_scope: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    audit: Mapped["Audit"] = relationship(back_populates="scopes")


class Checklist(TimestampMixin, Base):
    __tablename__ = "checklists"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_checklists_company_code"),
        CheckConstraint(
            "domain IN ('Financial', 'HR', 'Technology', 'Project', 'Customer', 'Operations', 'Compliance')",
            name="ck_checklists_valid_domain",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    domain: Mapped[str] = mapped_column(String(32), nullable=False)
    framework: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str] = mapped_column(String(24), nullable=False, default="1.0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    items: Mapped[list["ChecklistItem"]] = relationship(
        back_populates="checklist", cascade="all, delete-orphan", order_by="ChecklistItem.display_order"
    )


class ChecklistItem(TimestampMixin, Base):
    __tablename__ = "checklist_items"
    __table_args__ = (
        UniqueConstraint("checklist_id", "control_code", name="uq_checklist_items_code"),
        CheckConstraint("weight > 0", name="ck_checklist_items_weight_pos"),
        CheckConstraint("display_order >= 1", name="ck_checklist_items_order_pos"),
        Index("ix_checklist_items_checklist", "company_id", "checklist_id"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    checklist_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False
    )
    control_code: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    test_procedure: Mapped[str] = mapped_column(Text, nullable=False)
    weight: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=1.00)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    checklist: Mapped["Checklist"] = relationship(back_populates="items")


class AuditResponse(TimestampMixin, Base):
    __tablename__ = "audit_responses"
    __table_args__ = (
        UniqueConstraint("audit_id", "checklist_item_id", name="uq_audit_responses_audit_item"),
        CheckConstraint(
            "response_value IN ('Pass', 'Partial', 'Fail', 'N/A')",
            name="ck_audit_responses_value",
        ),
        CheckConstraint(
            "score_factor IS NULL OR score_factor IN (0.00, 0.50, 1.00)",
            name="ck_audit_responses_factor",
        ),
        Index("ix_audit_responses_audit", "company_id", "audit_id"),
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
    checklist_item_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("checklist_items.id", ondelete="RESTRICT"), nullable=False
    )
    responder_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    response_value: Mapped[str] = mapped_column(String(16), nullable=False)
    score_factor: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True)
    auditor_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    audit: Mapped["Audit"] = relationship(back_populates="responses")
    checklist_item: Mapped["ChecklistItem"] = relationship()
    responder = relationship("User", foreign_keys=[responder_user_id])

