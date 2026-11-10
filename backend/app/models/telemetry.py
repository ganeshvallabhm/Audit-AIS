from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.core import TimestampMixin


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "severity IN ('critical', 'warning', 'info')",
            name="ck_notifications_severity",
        ),
        Index(
            "ix_notifications_user_unread",
            "company_id",
            "user_id",
            "is_read",
            text("created_at DESC"),
        ),
        Index(
            "uq_notifications_dedup_key",
            "company_id",
            "user_id",
            "dedup_key",
            unique=True,
            postgresql_where=text("dedup_key IS NOT NULL"),
        ),
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
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="info")
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    entity_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    target_link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dedup_key: Mapped[str | None] = mapped_column(String(160), nullable=True)


class AuditHistory(Base):
    """Append-only governance history log with server-side payload digest."""

    __tablename__ = "audit_history"
    __table_args__ = (
        CheckConstraint(
            "category IN ('Sign-Off', 'Control Test', 'Risk Escalation', 'Evidence', 'System', 'Auth', 'Mutation')",
            name="ck_audit_history_category",
        ),
        CheckConstraint("event_sha256 ~ '^[0-9a-f]{64}$'", name="ck_audit_history_sha256"),
        CheckConstraint(
            "prev_event_sha256 IS NULL OR prev_event_sha256 ~ '^[0-9a-f]{64}$'",
            name="ck_audit_history_prev_sha256",
        ),
        Index("ix_audit_history_company_time", "company_id", text("created_at DESC")),
        Index("ix_audit_history_entity", "company_id", "entity_type", "entity_id"),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid4, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_label: Mapped[str] = mapped_column(String(150), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    module: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(48), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    entity_ref: Mapped[str] = mapped_column(String(48), nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    changes_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    prev_event_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

