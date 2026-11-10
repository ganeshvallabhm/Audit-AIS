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
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.core import TimestampMixin


class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_projects_company_code"),
        CheckConstraint("budget_amount >= 0", name="ck_projects_budget_nonneg"),
        CheckConstraint("actual_spend >= 0", name="ck_projects_spend_nonneg"),
        CheckConstraint(
            "status IN ('Planned', 'Active', 'At Risk', 'Completed', 'On Hold')",
            name="ck_projects_status",
        ),
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
    manager_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    budget_amount: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False, default=0)
    actual_spend: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="Active")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    department = relationship("Department")
    tasks: Mapped[list["ProjectTask"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectTask(TimestampMixin, Base):
    __tablename__ = "project_tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('Todo', 'In Progress', 'Blocked', 'Done')",
            name="ck_project_tasks_status",
        ),
        Index("ix_project_tasks_project", "company_id", "project_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    assignee_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    stage_gate: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="Todo")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sla_breached: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    project: Mapped["Project"] = relationship(back_populates="tasks")


class Employee(TimestampMixin, Base):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("company_id", "employee_code", name="uq_employees_company_code"),
        CheckConstraint(
            "employment_status IN ('Active', 'On Leave', 'Terminated')",
            name="ck_employees_status",
        ),
        Index("ix_employees_compliance", "company_id", "department_id", "security_training_completed"),
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
    user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    employee_code: Mapped[str] = mapped_column(String(32), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    role_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    background_check_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    security_training_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    training_completed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    employment_status: Mapped[str] = mapped_column(String(24), nullable=False, default="Active")
    hired_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    department = relationship("Department")


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("company_id", "account_code", name="uq_customers_company_code"),
        CheckConstraint("tier IN ('Enterprise', 'Mid-Market', 'Strategic')", name="ck_customers_tier"),
        CheckConstraint("dsar_requests_open >= 0", name="ck_customers_dsar_nonneg"),
        CheckConstraint("sla_compliance_pct BETWEEN 0 AND 100", name="ck_customers_sla_range"),
        CheckConstraint(
            "satisfaction_score IS NULL OR (satisfaction_score BETWEEN 0 AND 10)",
            name="ck_customers_csat_range",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    account_code: Mapped[str] = mapped_column(String(32), nullable=False)
    organization_name: Mapped[str] = mapped_column(String(200), nullable=False)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    tier: Mapped[str] = mapped_column(String(32), nullable=False, default="Enterprise")
    dpa_signed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    dsar_requests_open: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sla_compliance_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=100.00)
    satisfaction_score: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)


class FinancialMetric(TimestampMixin, Base):
    __tablename__ = "financial_metrics"
    __table_args__ = (
        UniqueConstraint("company_id", "fiscal_period", "metric_code", name="uq_fin_metrics_period_code"),
        Index("ix_fin_metrics_period", "company_id", "fiscal_period"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    department_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    fiscal_period: Mapped[str] = mapped_column(String(32), nullable=False)
    metric_code: Mapped[str] = mapped_column(String(40), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(150), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    reported_amount: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    budget_amount: Mapped[float | None] = mapped_column(Numeric(16, 2), nullable=True)
    variance_pct: Mapped[float | None] = mapped_column(Numeric(7, 4), nullable=True)
    sox_control_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    department = relationship("Department")

