from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Company(TimestampMixin, Base):
    __tablename__ = "companies"
    __table_args__ = (
        CheckConstraint(
            "enterprise_target_score >= 0 AND enterprise_target_score <= 100",
            name="ck_companies_target_score_range",
        ),
        CheckConstraint(
            "minimum_composite_floor >= 0 AND minimum_composite_floor <= 100",
            name="ck_companies_min_floor_range",
        ),
        CheckConstraint("board_risk_threshold >= 1", name="ck_companies_risk_threshold_pos"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    ticker: Mapped[str | None] = mapped_column(String(32), nullable=True)
    headquarters: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fiscal_year_label: Mapped[str] = mapped_column(String(64), nullable=False, default="FY 2025 (Q4 Active)")
    audit_committee_chair: Mapped[str | None] = mapped_column(String(150), nullable=True)
    external_auditor: Mapped[str | None] = mapped_column(String(150), nullable=True)
    regulatory_scope: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    enterprise_target_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=85.00)
    minimum_composite_floor: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=80.00)
    board_risk_threshold: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=5)
    digest_frequency: Mapped[str] = mapped_column(
        String(64), nullable=False, default="Weekly — Mondays 08:00 EST"
    )
    sla_auto_escalate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ai_citation_strict: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sha_lock_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    departments: Mapped[list["Department"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    users: Mapped[list["User"]] = relationship(back_populates="company", cascade="all, delete-orphan")


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('Admin', 'Auditor', 'Department Head', 'Management', 'Viewer')",
            name="ck_users_valid_role",
        ),
        Index("uq_users_company_lower_email", "company_id", func.lower(text("email")), unique=True),
        Index("ix_users_company_role", "company_id", "role"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    department_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL", use_alter=True, name="fk_users_department_id"),
        nullable=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    certifications: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    token_version: Mapped[int] = mapped_column(nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    company: Mapped["Company"] = relationship(back_populates="users")
    department: Mapped["Department | None"] = relationship(
        foreign_keys=[department_id], back_populates="members"
    )


class Department(TimestampMixin, Base):
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_departments_company_code"),
        CheckConstraint("target_score >= 0 AND target_score <= 100", name="ck_departments_target_score"),
        CheckConstraint("scoring_weight > 0 AND scoring_weight <= 1", name="ck_departments_weight"),
        Index("ix_departments_company", "company_id"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    head_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    target_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=85.00)
    scoring_weight: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, default=0.1250)
    attention_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    company: Mapped["Company"] = relationship(back_populates="departments")
    head_user: Mapped["User | None"] = relationship(foreign_keys=[head_user_id])
    members: Mapped[list["User"]] = relationship(
        foreign_keys=[User.department_id], back_populates="department"
    )


class RefreshSession(TimestampMixin, Base):
    __tablename__ = "refresh_sessions"
    __table_args__ = (
        Index("ix_refresh_sessions_user", "company_id", "user_id"),
        Index("ix_refresh_sessions_family", "company_id", "token_family"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_family: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("refresh_sessions.id", ondelete="SET NULL"), nullable=True
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped["User"] = relationship()


