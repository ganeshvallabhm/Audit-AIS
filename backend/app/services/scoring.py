from datetime import date, datetime, UTC
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.audit import Audit, AuditResponse, ChecklistItem
from app.models.core import Department
from app.models.governance import Finding

RESPONSE_SCORE_MAP: dict[str, Decimal | None] = {
    "Pass": Decimal("1.00"),
    "Partial": Decimal("0.50"),
    "Fail": Decimal("0.00"),
    "N/A": None,
}

ALLOWED_AUDIT_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "Draft": ("Scheduled",),
    "Scheduled": ("In Progress", "Draft"),
    "In Progress": ("Review",),
    "Review": ("Action Required", "Verification"),
    "Action Required": ("Verification", "Review"),
    "Verification": ("Closed", "Review"),
    "Closed": (),
}


def compute_initials(full_name: str | None) -> str:
    if not full_name:
        return "UA"
    parts = [p for p in full_name.strip().split() if p]
    if len(parts) == 1:
        return parts[0][:2].upper()
    return f"{parts[0][0]}{parts[-1][0]}".upper()


def classify_risk_severity(score: int) -> Literal["Low", "Medium", "High", "Critical"]:
    if score <= 4:
        return "Low"
    if score <= 9:
        return "Medium"
    if score <= 16:
        return "High"
    return "Critical"


def response_value_to_factor(response_value: str) -> Decimal | None:
    if response_value not in RESPONSE_SCORE_MAP:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported response_value '{response_value}'.",
        )
    return RESPONSE_SCORE_MAP[response_value]


def recalculate_audit_score(db: Session, audit: Audit) -> tuple[float | None, int, int]:
    """Computes weighted audit score from persisted responses. N/A is excluded."""
    rows = db.execute(
        select(AuditResponse, ChecklistItem.weight)
        .join(ChecklistItem, ChecklistItem.id == AuditResponse.checklist_item_id)
        .where(AuditResponse.audit_id == audit.id)
    ).all()

    total_responses = len(rows)
    earned_points = Decimal("0")
    applicable_weight = Decimal("0")

    for response, weight in rows:
        if response.response_value == "N/A" or response.score_factor is None:
            continue
        w = Decimal(str(weight))
        factor = Decimal(str(response.score_factor))
        earned_points += factor * w
        applicable_weight += w

    if applicable_weight <= 0:
        audit.computed_score = None
        return None, total_responses, 0

    pct = (earned_points / applicable_weight) * Decimal("100")
    rounded = float(pct.quantize(Decimal("0.01")))
    audit.computed_score = rounded
    return rounded, total_responses, total_responses


def validate_audit_status_transition(
    db: Session,
    audit: Audit,
    target_status: str,
) -> None:
    if target_status == audit.status:
        return

    allowed = ALLOWED_AUDIT_TRANSITIONS.get(audit.status, ())
    if target_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid audit status transition from '{audit.status}' to '{target_status}'. "
                f"Allowed next states: {list(allowed)}."
            ),
        )

    if target_status in {"Verification", "Closed"}:
        open_findings_count = db.scalar(
            select(func.count(Finding.id)).where(
                Finding.audit_id == audit.id,
                Finding.status != "Closed",
            )
        )
        if open_findings_count and open_findings_count > 0:
            if audit.status == "Review" and target_status == "Verification":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot skip 'Action Required' when open findings exist on this audit.",
                )
            if target_status == "Closed":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot close audit while unresolved findings remain open.",
                )


def compute_audit_stages(status_value: str, controls_evaluated: int, controls_total: int) -> list[dict]:
    testing_pct = 0
    if controls_total > 0:
        testing_pct = min(100, round((controls_evaluated / controls_total) * 100))

    if status_value == "Draft":
        return [
            {"name": "Scope Defined", "progress": 30, "state": "active"},
            {"name": "Evidence Gathering", "progress": 0, "state": "pending"},
            {"name": "Review & Testing", "progress": 0, "state": "pending"},
            {"name": "Final Sign-off", "progress": 0, "state": "pending"},
        ]
    if status_value == "Scheduled":
        return [
            {"name": "Scope Defined", "progress": 100, "state": "completed"},
            {"name": "Evidence Gathering", "progress": 0, "state": "pending"},
            {"name": "Review & Testing", "progress": 0, "state": "pending"},
            {"name": "Final Sign-off", "progress": 0, "state": "pending"},
        ]
    if status_value == "In Progress":
        return [
            {"name": "Scope Defined", "progress": 100, "state": "completed"},
            {"name": "Evidence Gathering", "progress": 100, "state": "completed"},
            {"name": "Review & Testing", "progress": max(20, testing_pct), "state": "active"},
            {"name": "Final Sign-off", "progress": 0, "state": "pending"},
        ]
    if status_value in {"Review", "Action Required"}:
        return [
            {"name": "Scope Defined", "progress": 100, "state": "completed"},
            {"name": "Evidence Gathering", "progress": 100, "state": "completed"},
            {"name": "Review & Testing", "progress": max(75, testing_pct), "state": "active"},
            {"name": "Final Sign-off", "progress": 25 if status_value == "Review" else 10, "state": "pending"},
        ]
    if status_value == "Verification":
        return [
            {"name": "Scope Defined", "progress": 100, "state": "completed"},
            {"name": "Evidence Gathering", "progress": 100, "state": "completed"},
            {"name": "Review & Testing", "progress": 100, "state": "completed"},
            {"name": "Final Sign-off", "progress": 65, "state": "active"},
        ]
    return [
        {"name": "Scope Defined", "progress": 100, "state": "completed"},
        {"name": "Evidence Gathering", "progress": 100, "state": "completed"},
        {"name": "Review & Testing", "progress": 100, "state": "completed"},
        {"name": "Final Sign-off", "progress": 100, "state": "completed"},
    ]


def compute_sla_countdown(target_sla_date: date, finding_status: str) -> tuple[str, bool]:
    if finding_status == "Closed":
        return "Signed Off", False
    if finding_status == "Verification Pending":
        return "Pending Sign-off", False
    today = datetime.now(UTC).date()
    delta_days = (target_sla_date - today).days
    if delta_days < 0:
        return f"Overdue {abs(delta_days)}d", True
    if delta_days == 0:
        return "Due Today", False
    return f"In {delta_days} Days", False


def compute_department_score(db: Session, department: Department) -> float | None:
    scores = db.scalars(
        select(Audit.computed_score).where(
            Audit.department_id == department.id,
            Audit.computed_score.is_not(None),
        )
    ).all()
    if not scores:
        return None
    return round(sum(float(s) for s in scores) / len(scores), 2)

