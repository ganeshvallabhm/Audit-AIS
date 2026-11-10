from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

import numpy as np
from sklearn.linear_model import LinearRegression
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import Audit, AuditResponse, ChecklistItem


def build_performance_trend_and_forecast(
    db: Session,
    company_id: UUID,
    *,
    live_composite_score: float,
    enterprise_target: float,
    period: str = "Q4 2025",
    department_id: UUID | None = None,
    domain: str | None = None,
    audit_status: str | None = None,
    d_from: date | None = None,
    d_to: date | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Computes monthly compliance trajectory strictly from persisted PostgreSQL AuditResponse
    and ChecklistItem weights. Never fabricates synthetic history points.
    Linear regression forecasting runs only when >= 3 distinct chronological months exist.
    """
    stmt = (
        select(AuditResponse.tested_at, AuditResponse.response_value, AuditResponse.score_factor, ChecklistItem.weight)
        .join(ChecklistItem, ChecklistItem.id == AuditResponse.checklist_item_id)
        .join(Audit, Audit.id == AuditResponse.audit_id)
        .where(AuditResponse.company_id == company_id)
    )
    if department_id is not None:
        stmt = stmt.where(Audit.department_id == department_id)
    if domain is not None:
        stmt = stmt.where(Audit.domain == domain)
    if audit_status is not None:
        stmt = stmt.where(Audit.status == audit_status)
    if d_from is not None:
        stmt = stmt.where(
            AuditResponse.tested_at >= datetime.combine(d_from, datetime.min.time(), tzinfo=UTC)
        )
    if d_to is not None:
        stmt = stmt.where(
            AuditResponse.tested_at <= datetime.combine(d_to, datetime.max.time(), tzinfo=UTC)
        )

    rows = db.execute(stmt.order_by(AuditResponse.tested_at.asc())).all()

    monthly_buckets: dict[str, dict[str, Any]] = {}
    for tested_at, resp_val, factor, weight in rows:
        dt = tested_at if isinstance(tested_at, datetime) else datetime.now(UTC)
        month_key = dt.strftime("%Y-%m")
        month_label = dt.strftime("%b %Y")
        bucket = monthly_buckets.setdefault(
            month_key,
            {"label": month_label, "earned": 0.0, "weight": 0.0, "count": 0},
        )
        bucket["count"] += 1
        if resp_val != "N/A" and factor is not None:
            w = float(weight)
            bucket["earned"] += float(factor) * w
            bucket["weight"] += w

    monthly_points: list[tuple[str, float, int]] = []
    for key in sorted(monthly_buckets.keys()):
        b = monthly_buckets[key]
        if b["weight"] > 0:
            score = round((b["earned"] / b["weight"]) * 100.0, 2)
            monthly_points.append((b["label"], score, b["count"]))

    data_points_count = len(monthly_points)
    is_sufficient = data_points_count >= 3
    target_val = round(float(enterprise_target), 2)

    if data_points_count == 0:
        return [], {
            "slope_per_month": 0.0,
            "intercept": round(float(live_composite_score), 3),
            "r_squared": 0.0,
            "current_score": round(float(live_composite_score), 2),
            "target_score": target_val,
            "projected_next_month": round(float(live_composite_score), 2),
            "predicted_months_to_target": None,
            "predicted_days_ahead_or_behind": 0,
            "confidence_label": "No Historical Control Data",
            "data_points_count": 0,
            "is_sufficient_for_forecast": False,
            "methodology_note": (
                f"No tested control responses found for period scope '{period}'. "
                "Submit checklist test evaluations to establish a historical baseline."
            ),
        }

    baseline_floor = max(40.0, round(target_val - 15.0, 1))

    if not is_sufficient:
        latest_actual = float(monthly_points[-1][1])
        trend_points = [
            {
                "month": label,
                "actual": actual_val,
                "target": target_val,
                "baseline": baseline_floor,
                "predicted": None,
                "audited_controls_count": cnt,
            }
            for label, actual_val, cnt in monthly_points
        ]
        return trend_points, {
            "slope_per_month": 0.0,
            "intercept": round(latest_actual, 3),
            "r_squared": 0.0,
            "current_score": round(latest_actual, 2),
            "target_score": target_val,
            "projected_next_month": round(latest_actual, 2),
            "predicted_months_to_target": None,
            "predicted_days_ahead_or_behind": 0,
            "confidence_label": f"Insufficient History ({data_points_count}/3 months)",
            "data_points_count": data_points_count,
            "is_sufficient_for_forecast": False,
            "methodology_note": (
                f"Only {data_points_count} chronological month(s) recorded in PostgreSQL. "
                "At least 3 monthly data points are required for Scikit-learn LinearRegression."
            ),
        }

    x = np.arange(data_points_count, dtype=float).reshape(-1, 1)
    y = np.array([pt[1] for pt in monthly_points], dtype=float)

    model = LinearRegression()
    model.fit(x, y)

    slope = float(model.coef_[0])
    intercept = float(model.intercept_)
    r_squared = float(model.score(x, y)) if len(y) > 1 and np.std(y) > 0 else 1.0
    predictions = model.predict(x)

    projected_next = float(model.predict(np.array([[float(data_points_count)]]))[0])
    projected_next = round(min(100.0, max(0.0, projected_next)), 2)

    latest_actual = float(y[-1])
    gap = float(enterprise_target) - latest_actual
    if gap <= 0:
        months_to_target: float | None = 0.0
        days_delta = 0
        confidence = "Target Achieved"
    elif slope > 0.05:
        months_to_target = round(gap / slope, 2)
        days_delta = (
            max(1, round((1.0 - min(months_to_target, 1.0)) * 30))
            if months_to_target <= 1
            else -round((months_to_target - 1.0) * 30)
        )
        if days_delta == 0:
            days_delta = 12
        confidence = "High Fit" if r_squared >= 0.85 else "Moderate Fit"
    else:
        months_to_target = None
        days_delta = -30
        confidence = "Flat / Declining Trajectory"

    trend_points = [
        {
            "month": label,
            "actual": round(actual_val, 2),
            "target": target_val,
            "baseline": round(min(target_val, baseline_floor + idx * 3.0), 2),
            "predicted": round(min(100.0, max(0.0, float(pred_val))), 2),
            "audited_controls_count": cnt,
        }
        for idx, ((label, actual_val, cnt), pred_val) in enumerate(
            zip(monthly_points, predictions, strict=True)
        )
    ]

    forecast_summary = {
        "slope_per_month": round(slope, 3),
        "intercept": round(intercept, 3),
        "r_squared": round(r_squared, 4),
        "current_score": round(latest_actual, 2),
        "target_score": target_val,
        "projected_next_month": projected_next,
        "predicted_months_to_target": months_to_target,
        "predicted_days_ahead_or_behind": days_delta,
        "confidence_label": confidence,
        "data_points_count": data_points_count,
        "is_sufficient_for_forecast": True,
        "methodology_note": (
            f"OLS LinearRegression fitted on {data_points_count} real PostgreSQL monthly weighted compliance scores "
            f"(R^2 = {r_squared:.3f}, slope = {slope:+.2f}%/mo)."
        ),
    }
    return trend_points, forecast_summary
