from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.audit import Audit, AuditResponse, Checklist, ChecklistItem
from app.models.core import Company, Department
from app.models.governance import CorrectiveAction, Evidence, Finding, Risk
from app.services.scoring import classify_risk_severity


def resolve_period_bounds(
    period: str | None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[date | None, date | None]:
    if date_from is not None or date_to is not None:
        return date_from, date_to

    if not period:
        return None, None

    norm = period.strip().lower()
    today = datetime.now(UTC).date()
    if norm in {"all", "all time", "q4 2025", "fy 2025", "fy 2025 (q4 active)", "active"}:
        return None, None
    if norm in {"30d", "last 30 days"}:
        return today - timedelta(days=30), today
    if norm in {"60d", "last 60 days"}:
        return today - timedelta(days=60), today
    if norm in {"90d", "last 90 days"}:
        return today - timedelta(days=90), today
    if norm in {"180d", "last 6 months"}:
        return today - timedelta(days=180), today
    if norm == "ytd":
        return date(today.year, 1, 1), today
    if "q3" in norm:
        return today - timedelta(days=120), today - timedelta(days=31)
    if "q2" in norm:
        return today - timedelta(days=210), today - timedelta(days=121)
    return None, None


def _audit_in_bounds(audit: Audit, d_from: date | None, d_to: date | None) -> bool:
    if d_from is None and d_to is None:
        return True
    start = audit.scheduled_start or audit.created_at.date()
    end = audit.target_due_date or (audit.completed_at.date() if audit.completed_at else start)
    if d_from is not None and end < d_from:
        return False
    if d_to is not None and start > d_to:
        return False
    return True


def _date_in_bounds(dt: date | None, d_from: date | None, d_to: date | None) -> bool:
    if d_from is None and d_to is None:
        return True
    if dt is None:
        return True
    if d_from is not None and dt < d_from:
        return False
    if d_to is not None and dt > d_to:
        return False
    return True


def compute_department_score_map(
    db: Session,
    company_id: UUID,
    departments: list[Department],
    *,
    audits: list[Audit] | None = None,
    findings: list[Finding] | None = None,
    risks: list[Risk] | None = None,
) -> tuple[dict[UUID, dict[str, Any]], float]:
    """
    Aggregates live audit scores, active audit counts, open findings, and risk counts
    per department using Pandas & NumPy. Returns (dept_metrics_map, weighted_composite_score).
    """
    if audits is None:
        audits = list(db.scalars(select(Audit).where(Audit.company_id == company_id)).all())
    if findings is None:
        findings = list(db.scalars(select(Finding).where(Finding.company_id == company_id)).all())
    if risks is None:
        risks = list(db.scalars(select(Risk).where(Risk.company_id == company_id)).all())

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


def compute_risk_distribution(
    db: Session,
    company_id: UUID,
    *,
    risks: list[Risk] | None = None,
) -> dict[str, Any]:
    """Computes full 5x5 matrix cell aggregates and severity/category/status breakdowns via Pandas."""
    if risks is None:
        risks = list(db.scalars(select(Risk).where(Risk.company_id == company_id)).all())

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


def compute_sla_metrics(
    db: Session,
    company_id: UUID,
    *,
    findings: list[Finding] | None = None,
    actions: list[CorrectiveAction] | None = None,
) -> dict[str, Any]:
    if findings is None:
        findings = list(db.scalars(select(Finding).where(Finding.company_id == company_id)).all())
    if actions is None:
        actions = list(db.scalars(select(CorrectiveAction).where(CorrectiveAction.company_id == company_id)).all())
    today = datetime.now(UTC).date()

    open_findings = [f for f in findings if f.status != "Closed"]
    critical_findings = [f for f in open_findings if f.severity == "Critical"]
    overdue_findings = [
        f
        for f in open_findings
        if f.status == "Overdue" or (isinstance(f.target_sla_date, date) and f.target_sla_date < today)
    ]
    overdue_actions = [
        a
        for a in actions
        if a.status != "Verified" and isinstance(a.due_date, date) and a.due_date < today
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
        "overdue_actions_count": len(overdue_actions),
        "sla_compliance_pct": sla_compliance_pct,
        "total_actions": len(actions),
        "avg_action_progress_pct": avg_action_progress,
    }


def compute_framework_compliance(
    db: Session,
    company_id: UUID,
    *,
    domain: str | None = None,
    filtered_audit_ids: set[UUID] | None = None,
    d_from: date | None = None,
    d_to: date | None = None,
) -> list[dict[str, Any]]:
    chk_stmt = (
        select(Checklist)
        .options(selectinload(Checklist.items))
        .where(Checklist.company_id == company_id, Checklist.is_active.is_(True))
    )
    if domain:
        chk_stmt = chk_stmt.where(Checklist.domain == domain)
    checklists = list(db.scalars(chk_stmt.order_by(Checklist.framework)).all())
    if not checklists:
        return []

    resp_stmt = select(AuditResponse).where(AuditResponse.company_id == company_id)
    if filtered_audit_ids is not None:
        if not filtered_audit_ids:
            responses: list[AuditResponse] = []
        else:
            resp_stmt = resp_stmt.where(AuditResponse.audit_id.in_(filtered_audit_ids))
            if d_from is not None:
                resp_stmt = resp_stmt.where(AuditResponse.tested_at >= datetime.combine(d_from, datetime.min.time(), tzinfo=UTC))
            if d_to is not None:
                resp_stmt = resp_stmt.where(AuditResponse.tested_at <= datetime.combine(d_to, datetime.max.time(), tzinfo=UTC))
            responses = list(db.scalars(resp_stmt.order_by(AuditResponse.tested_at.desc())).all())
    else:
        responses = list(db.scalars(resp_stmt.order_by(AuditResponse.tested_at.desc())).all())

    latest_by_item: dict[UUID, AuditResponse] = {}
    for resp in responses:
        if resp.checklist_item_id not in latest_by_item:
            latest_by_item[resp.checklist_item_id] = resp

    grouped_items: dict[str, list[ChecklistItem]] = {}
    for chk in checklists:
        grouped_items.setdefault(chk.framework, []).extend(chk.items)

    results: list[dict[str, Any]] = []
    for framework_name, items in grouped_items.items():
        controls_total = len(items)
        evaluated = 0
        earned = 0.0
        applicable_weight = 0.0
        for item in items:
            latest = latest_by_item.get(item.id)
            if latest is None:
                continue
            evaluated += 1
            if latest.response_value == "N/A" or latest.score_factor is None:
                continue
            w = float(item.weight)
            earned += float(latest.score_factor) * w
            applicable_weight += w

        if applicable_weight > 0:
            score = round((earned / applicable_weight) * 100.0, 1)
            if score >= 85.0:
                status_label = "Compliant"
            elif score >= 70.0:
                status_label = "Monitor"
            else:
                status_label = "Needs Attention"
        else:
            score = 0.0
            status_label = "Not Evaluated"

        results.append(
            {
                "framework": framework_name,
                "controls_total": controls_total,
                "controls_evaluated": evaluated,
                "score": score,
                "status": status_label,
            }
        )
    return results


def build_company_overview_numbers(
    db: Session,
    company: Company,
    *,
    period: str = "Q4 2025",
    date_from: date | None = None,
    date_to: date | None = None,
    department_id: UUID | None = None,
    domain: str | None = None,
    audit_status: str | None = None,
    risk_severity: str | None = None,
) -> dict[str, Any]:
    d_from, d_to = resolve_period_bounds(period, date_from, date_to)

    dept_stmt = select(Department).where(Department.company_id == company.id).order_by(Department.code)
    if department_id is not None:
        dept_stmt = dept_stmt.where(Department.id == department_id)
    departments = list(db.scalars(dept_stmt).all())

    all_audits = list(db.scalars(select(Audit).where(Audit.company_id == company.id)).all())
    audit_domain_map = {a.id: a.domain for a in all_audits}

    filtered_audits = [
        a
        for a in all_audits
        if (department_id is None or a.department_id == department_id)
        and (domain is None or a.domain == domain)
        and (audit_status is None or a.status == audit_status)
        and _audit_in_bounds(a, d_from, d_to)
    ]
    filtered_audit_ids = {a.id for a in filtered_audits}

    all_findings = list(db.scalars(select(Finding).where(Finding.company_id == company.id)).all())
    filtered_findings = [
        f
        for f in all_findings
        if (department_id is None or f.department_id == department_id)
        and (domain is None or audit_domain_map.get(f.audit_id) == domain)
        and _date_in_bounds(f.target_sla_date, d_from, d_to)
    ]
    filtered_finding_ids = {f.id for f in filtered_findings}

    all_risks = list(db.scalars(select(Risk).where(Risk.company_id == company.id)).all())
    filtered_risks = [
        r
        for r in all_risks
        if (department_id is None or r.department_id == department_id)
        and (domain is None or r.category == domain)
        and (risk_severity is None or r.severity == risk_severity)
    ]
    filtered_risk_ids = {r.id for r in filtered_risks}

    all_actions = list(
        db.scalars(select(CorrectiveAction).where(CorrectiveAction.company_id == company.id)).all()
    )
    filtered_actions = [
        act
        for act in all_actions
        if (act.finding_id in filtered_finding_ids if department_id or domain else True)
        or (act.risk_id in filtered_risk_ids if department_id or domain or risk_severity else True)
    ]

    all_evidence = list(db.scalars(select(Evidence).where(Evidence.company_id == company.id)).all())
    has_scope_filter = bool(department_id or domain or audit_status or d_from or d_to)
    filtered_evidence = (
        [
            ev
            for ev in all_evidence
            if (ev.audit_id in filtered_audit_ids or ev.finding_id in filtered_finding_ids)
        ]
        if has_scope_filter
        else all_evidence
    )
    evidence_breakdown = {
        "total": len(filtered_evidence),
        "verified": sum(1 for e in filtered_evidence if e.verification_status == "Verified"),
        "pending_review": sum(1 for e in filtered_evidence if e.verification_status == "Pending Review"),
        "flagged": sum(1 for e in filtered_evidence if e.verification_status == "Flagged"),
    }

    dept_metrics, composite_score = compute_department_score_map(
        db,
        company.id,
        departments,
        audits=filtered_audits,
        findings=filtered_findings,
        risks=filtered_risks,
    )

    active_audits_count = sum(1 for a in filtered_audits if a.status != "Closed")
    completed_audits_count = sum(1 for a in filtered_audits if a.status == "Closed")
    total_audits_count = len(filtered_audits)
    audit_completion_rate_pct = (
        round((completed_audits_count / total_audits_count) * 100.0, 1) if total_audits_count > 0 else 0.0
    )

    sla_metrics = compute_sla_metrics(
        db,
        company.id,
        findings=filtered_findings,
        actions=filtered_actions,
    )
    risk_dist = compute_risk_distribution(db, company.id, risks=filtered_risks)
    critical_high_risks = risk_dist["by_severity"].get("Critical", 0) + risk_dist["by_severity"].get(
        "High", 0
    )

    framework_compliance = compute_framework_compliance(
        db,
        company.id,
        domain=domain,
        filtered_audit_ids=filtered_audit_ids if has_scope_filter else None,
        d_from=d_from,
        d_to=d_to,
    )

    return {
        "departments": departments,
        "dept_metrics": dept_metrics,
        "filtered_audit_ids": filtered_audit_ids,
        "filtered_finding_ids": filtered_finding_ids,
        "date_bounds": (d_from, d_to),
        "composite_score": composite_score,
        "active_audits_count": active_audits_count,
        "completed_audits_count": completed_audits_count,
        "total_audits_count": total_audits_count,
        "audit_completion_rate_pct": audit_completion_rate_pct,
        **sla_metrics,
        "risk_distribution": risk_dist,
        "critical_high_risks_count": critical_high_risks,
        "framework_compliance": framework_compliance,
        "evidence_breakdown": evidence_breakdown,
        "kpi_methodology": {
            "composite_score": "Weighted average of departmental audit compliance scores using department scoring_weight.",
            "audit_completion_rate_pct": "Closed audits divided by total audits within the active filter window.",
            "sla_compliance_pct": "Percentage of findings Closed or on-schedule against target_sla_date.",
            "framework_compliance": "Weighted control pass rate across active checklists excluding N/A responses.",
            "forecast": "Scikit-learn LinearRegression fit on chronological monthly tested control scores (requires >=3 months).",
        },
    }
