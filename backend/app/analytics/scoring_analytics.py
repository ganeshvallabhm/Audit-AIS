from datetime import date, datetime, UTC
from typing import Any
from uuid import UUID

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import Audit
from app.models.core import Company, Department
from app.models.governance import CorrectiveAction, Finding, Risk
from app.services.scoring import classify_risk_severity


def compute_department_score_map(
    db: Session,
    company_id: UUID,
    departments: list[Department],
) -> tuple[dict[UUID, dict[str, Any]], float]:
    """
    Aggregates live audit scores, active audit counts, open findings, and risk counts
    per department using Pandas & NumPy. Returns (dept_metrics_map, weighted_composite_score).
    """
    audits = db.scalars(select(Audit).where(Audit.company_id == company_id)).all()
    findings = db.scalars(select(Finding).where(Finding.company_id == company_id)).all()
    risks = db.scalars(select(Risk).where(Risk.company_id == company_id)).all()

    audits_df = pd.DataFrame(
        [
            {
                "department_id": a.department_id,
                "status": a.status,
                "computed_score": float(a.computed_score) if a.computed_score is not None else np.nan,
            }
            for a in audits
        ]
    )
    findings_df = pd.DataFrame(
        [
            {
                "department_id": f.department_id,
                "status": f.status,
            }
            for f in findings
        ]
    )
    risks_df = pd.DataFrame(
        [
            {
                "department_id": r.department_id,
                "severity": r.severity,
            }
            for r in risks
        ]
    )

    metrics_by_dept: dict[UUID, dict[str, Any]] = {}
    weighted_scores: list[float] = []
    weights: list[float] = []

    for dept in departments:
        dept_score: float | None = None
        active_audits = 0
        open_findings = 0
        risk_count = 0

        if not audits_df.empty:
            sub_audits = audits_df[audits_df["department_id"] == dept.id]
            active_audits = int((sub_audits["status"] != "Closed").sum())
            valid_scores = sub_audits["computed_score"].dropna()
            if not valid_scores.empty:
                dept_score = round(float(valid_scores.mean()), 2)

        if not findings_df.empty:
            sub_findings = findings_df[findings_df["department_id"] == dept.id]
            open_findings = int((sub_findings["status"] != "Closed").sum())

        if not risks_df.empty:
            sub_risks = risks_df[risks_df["department_id"] == dept.id]
            risk_count = int(len(sub_risks))

        if dept_score is not None:
            weighted_scores.append(dept_score)
            weights.append(float(dept.scoring_weight))

        attention_area = bool(
            (dept_score is not None and dept_score < float(dept.target_score))
            or open_findings >= 4
            or bool(dept.attention_note)
        )

        metrics_by_dept[dept.id] = {
            "score": dept_score,
            "active_audits": active_audits,
            "open_findings": open_findings,
            "risk_count": risk_count,
            "attention_area": attention_area,
        }

    if weighted_scores and sum(weights) > 0:
        composite = round(float(np.average(np.array(weighted_scores), weights=np.array(weights))), 2)
    else:
        composite = 0.0

    return metrics_by_dept, composite


def compute_risk_distribution(db: Session, company_id: UUID) -> dict[str, Any]:
    """Computes full 5x5 matrix cell aggregates and severity/category/status breakdowns via Pandas."""
    risks = db.scalars(select(Risk).where(Risk.company_id == company_id)).all()

    severities = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    categories: dict[str, int] = {}
    statuses: dict[str, int] = {}

    if risks:
        df = pd.DataFrame(
            [
                {
                    "code": r.code,
                    "probability": int(r.probability),
                    "impact": int(r.impact),
                    "severity": r.severity,
                    "category": r.category,
                    "status": r.status,
                }
                for r in risks
            ]
        )
        for sev, cnt in df["severity"].value_counts().items():
            severities[str(sev)] = int(cnt)
        categories = {str(k): int(v) for k, v in df["category"].value_counts().items()}
        statuses = {str(k): int(v) for k, v in df["status"].value_counts().items()}

        cell_groups = df.groupby(["probability", "impact"])["code"].apply(list).to_dict()
    else:
        cell_groups = {}

    matrix: list[dict[str, Any]] = []
    for prob in range(5, 0, -1):
        for imp in range(1, 6):
            codes = cell_groups.get((prob, imp), [])
            score = prob * imp
            matrix.append(
                {
                    "probability": prob,
                    "impact": imp,
                    "score": score,
                    "severity": classify_risk_severity(score),
                    "count": len(codes),
                    "risk_codes": list(codes),
                }
            )

    return {
        "total_risks": len(risks),
        "by_severity": severities,
        "by_category": categories,
        "by_status": statuses,
        "matrix": matrix,
    }


def compute_sla_metrics(db: Session, company_id: UUID) -> dict[str, Any]:
    findings = db.scalars(select(Finding).where(Finding.company_id == company_id)).all()
    actions = db.scalars(select(CorrectiveAction).where(CorrectiveAction.company_id == company_id)).all()
    today = datetime.now(UTC).date()

    open_findings = [f for f in findings if f.status != "Closed"]
    critical_findings = [f for f in open_findings if f.severity == "Critical"]
    overdue_findings = [
        f
        for f in open_findings
        if f.status == "Overdue" or (isinstance(f.target_sla_date, date) and f.target_sla_date < today)
    ]

    if findings:
        on_track_count = sum(
            1
            for f in findings
            if f.status == "Closed" or (f.status != "Overdue" and f.target_sla_date >= today)
        )
        sla_compliance_pct = round((on_track_count / len(findings)) * 100.0, 1)
    else:
        sla_compliance_pct = 100.0

    avg_action_progress = (
        round(float(np.mean([a.progress_percent for a in actions])), 1) if actions else 0.0
    )

    return {
        "total_findings": len(findings),
        "open_findings_count": len(open_findings),
        "critical_findings_count": len(critical_findings),
        "overdue_findings_count": len(overdue_findings),
        "sla_compliance_pct": sla_compliance_pct,
        "total_actions": len(actions),
        "avg_action_progress_pct": avg_action_progress,
    }


def build_company_overview_numbers(
    db: Session,
    company: Company,
) -> dict[str, Any]:
    departments = db.scalars(
        select(Department).where(Department.company_id == company.id).order_by(Department.code)
    ).all()
    dept_metrics, composite_score = compute_department_score_map(db, company.id, list(departments))

    audits = db.scalars(select(Audit).where(Audit.company_id == company.id)).all()
    active_audits_count = sum(1 for a in audits if a.status != "Closed")
    completed_audits_count = sum(1 for a in audits if a.status == "Closed")

    sla_metrics = compute_sla_metrics(db, company.id)
    risk_dist = compute_risk_distribution(db, company.id)
    critical_high_risks = risk_dist["by_severity"].get("Critical", 0) + risk_dist["by_severity"].get(
        "High", 0
    )

    return {
        "departments": list(departments),
        "dept_metrics": dept_metrics,
        "composite_score": composite_score,
        "active_audits_count": active_audits_count,
        "completed_audits_count": completed_audits_count,
        "total_audits_count": len(audits),
        **sla_metrics,
        "risk_distribution": risk_dist,
        "critical_high_risks_count": critical_high_risks,
    }

