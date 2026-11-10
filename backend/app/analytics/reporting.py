from datetime import datetime, UTC
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.forecasting import build_performance_trend_and_forecast
from app.analytics.scoring_analytics import build_company_overview_numbers
from app.models.audit import Audit
from app.models.core import Company, Department
from app.models.governance import CorrectiveAction, Evidence, Finding, Risk

REPORT_SUITES_CATALOG: list[dict[str, Any]] = [
    {
        "id": "rep-board",
        "title": "Executive Board Audit Package",
        "description": "High-level fiduciary synthesis, audit opinion letter, key risk indicators, and board committee sign-offs.",
        "updated_at": "Live Database Snapshot",
        "on_demand": False,
        "tags": ["Quarterly", "Executive & Board"],
        "format_tag": "PDF + CSV",
        "icon": "building",
        "primary_action": "Download PDF",
        "secondary_action": "Customize",
    },
    {
        "id": "rep-statutory",
        "title": "Statutory Compliance & Cross-Walk",
        "description": "Formal control mapping across SOC 2 Type II, ISO/IEC 27001, GDPR Art. 30, and SOX 404 Subpart B.",
        "updated_at": "Live Database Snapshot",
        "on_demand": False,
        "tags": ["Compliance", "Auditor Certified"],
        "format_tag": "PDF + CSV",
        "icon": "shield",
        "primary_action": "Download PDF",
        "secondary_action": "Customize",
    },
    {
        "id": "rep-risk",
        "title": "Enterprise Risk & Threat Matrix",
        "description": "Full 5x5 inherent and residual risk rankings, threat vectors, treatment plans, and risk owner delegations.",
        "updated_at": "Live Database Snapshot",
        "on_demand": False,
        "tags": ["Risk Management", "Monthly"],
        "format_tag": "PDF + CSV",
        "icon": "grid",
        "primary_action": "Download PDF",
        "secondary_action": "Customize",
    },
    {
        "id": "rep-sla",
        "title": "Action Plan & SLA Velocity",
        "description": "Remediation milestone velocity, departmental SLA breach analysis, and overdue action root cause diagnostics.",
        "updated_at": "Live Database Snapshot",
        "on_demand": False,
        "tags": ["Operations & Audit", "Weekly"],
        "format_tag": "CSV + PDF",
        "icon": "alarm",
        "primary_action": "Download PDF",
        "secondary_action": "Customize",
    },
    {
        "id": "rep-dept",
        "title": "Departmental Audit Scorecard",
        "description": "Comparative operational health breakdown across Technology, Finance, Operations, HR, and Legal divisions.",
        "updated_at": "Live Database Snapshot",
        "on_demand": False,
        "tags": ["Management", "Quarterly"],
        "format_tag": "PDF + CSV",
        "icon": "domain",
        "primary_action": "Download PDF",
        "secondary_action": "Customize",
    },
    {
        "id": "rep-ai",
        "title": "AI Audit & Anomaly Synthesis",
        "description": "Automated grounded analysis of audit logs, recurring control failures, and Scikit-learn predictive trajectories.",
        "updated_at": "Generated on-demand",
        "on_demand": True,
        "tags": ["AI Analytics", "Live Stream"],
        "format_tag": "Interactive Report",
        "icon": "brain",
        "primary_action": "Generate Report",
        "secondary_action": "Configure Feeds",
    },
]


def get_report_suites() -> list[dict[str, Any]]:
    return REPORT_SUITES_CATALOG


def build_report_detail(db: Session, company: Company, report_id: str) -> dict[str, Any]:
    suite = next((s for s in REPORT_SUITES_CATALOG if s["id"] == report_id), None)
    if suite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report suite '{report_id}' not found.",
        )

    overview = build_company_overview_numbers(db, company)
    _, forecast = build_performance_trend_and_forecast(
        live_composite_score=overview["composite_score"],
        enterprise_target=float(company.enterprise_target_score),
    )

    audits = db.scalars(select(Audit).where(Audit.company_id == company.id).order_by(Audit.code)).all()
    risks = db.scalars(select(Risk).where(Risk.company_id == company.id).order_by(Risk.inherent_score.desc())).all()
    findings = db.scalars(select(Finding).where(Finding.company_id == company.id).order_by(Finding.code)).all()
    departments = overview["departments"]
    dept_metrics = overview["dept_metrics"]

    if report_id == "rep-risk":
        csv_headers = ["Risk Code", "Title", "Category", "Probability", "Impact", "Inherent Score", "Severity", "Status"]
        csv_rows = [
            [r.code, r.title, r.category, r.probability, r.impact, r.inherent_score, r.severity, r.status]
            for r in risks
        ]
        summary = (
            f"Active enterprise risk portfolio comprises {len(risks)} tracked exposures across {len(departments)} business units; "
            f"{overview['critical_high_risks_count']} are classified Critical or High severity."
        )
    elif report_id == "rep-sla":
        csv_headers = ["Finding Code", "Title", "Severity", "Status", "Target SLA Date"]
        csv_rows = [
            [f.code, f.title, f.severity, f.status, str(f.target_sla_date)]
            for f in findings
        ]
        summary = (
            f"Remediation SLA compliance stands at {overview['sla_compliance_pct']}% across {len(findings)} findings "
            f"({overview['overdue_findings_count']} overdue, {overview['avg_action_progress_pct']}% average action velocity)."
        )
    elif report_id == "rep-dept":
        csv_headers = ["Department Code", "Department Name", "Composite Score", "Target Score", "Active Audits", "Open Findings"]
        csv_rows = [
            [
                d.code,
                d.name,
                dept_metrics[d.id]["score"] if dept_metrics[d.id]["score"] is not None else "N/A",
                float(d.target_score),
                dept_metrics[d.id]["active_audits"],
                dept_metrics[d.id]["open_findings"],
            ]
            for d in departments
        ]
        summary = (
            f"Weighted enterprise readiness across {len(departments)} divisions is {overview['composite_score']}% "
            f"against the {float(company.enterprise_target_score):.1f}% statutory target."
        )
    else:
        csv_headers = ["Audit Code", "Title", "Domain", "Framework", "Status", "Computed Score"]
        csv_rows = [
            [
                a.code,
                a.title,
                a.domain,
                a.framework,
                a.status,
                float(a.computed_score) if a.computed_score is not None else "Pending",
            ]
            for a in audits
        ]
        summary = (
            f"{company.legal_name} maintains {overview['composite_score']}% weighted compliance readiness across "
            f"{overview['total_audits_count']} audits with {forecast['slope_per_month']:+.2f}% monthly convergence slope "
            f"(R² = {forecast['r_squared']})."
        )

    return {
        "id": suite["id"],
        "title": suite["title"],
        "generated_at": datetime.now(UTC),
        "company_name": company.legal_name,
        "fiscal_year": company.fiscal_year_label,
        "executive_summary": summary,
        "kpis": {
            "composite_score": overview["composite_score"],
            "enterprise_target": float(company.enterprise_target_score),
            "open_findings": overview["open_findings_count"],
            "overdue_findings": overview["overdue_findings_count"],
            "critical_high_risks": overview["critical_high_risks_count"],
            "sla_compliance_pct": overview["sla_compliance_pct"],
            "forecast_next_month": forecast["projected_next_month"],
        },
        "sections": [
            {
                "heading": "Quantitative Governance Posture",
                "metrics": [
                    {"label": "Weighted Readiness", "value": f"{overview['composite_score']}%"},
                    {"label": "Linear Forecast Slope", "value": f"{forecast['slope_per_month']:+.2f}% / mo"},
                    {"label": "SLA On-Time Rate", "value": f"{overview['sla_compliance_pct']}%"},
                    {"label": "Open / Critical Findings", "value": f"{overview['open_findings_count']} / {overview['critical_findings_count']}"},
                ],
            },
            {
                "heading": "Divisional Watchlist",
                "items": [
                    {
                        "code": d.code,
                        "name": d.name,
                        "score": dept_metrics[d.id]["score"],
                        "target": float(d.target_score),
                        "open_findings": dept_metrics[d.id]["open_findings"],
                        "note": d.attention_note,
                    }
                    for d in departments
                    if dept_metrics[d.id]["attention_area"]
                ],
            },
        ],
        "csv_headers": csv_headers,
        "csv_rows": csv_rows,
    }


def generate_grounded_ai_synthesis(
    db: Session,
    company: Company,
    prompt: str,
    domain: str | None = None,
) -> dict[str, Any]:
    """
    Produces a grounded executive governance synthesis directly from PostgreSQL records
    with entity-level citations (Audits, Findings, Risks, Evidence).
    """
    overview = build_company_overview_numbers(db, company)
    _, forecast = build_performance_trend_and_forecast(
        live_composite_score=overview["composite_score"],
        enterprise_target=float(company.enterprise_target_score),
    )

    findings_query = select(Finding).where(Finding.company_id == company.id)
    if domain:
        findings_query = findings_query.join(Audit, Audit.id == Finding.audit_id).where(Audit.domain == domain)
    top_findings = db.scalars(
        findings_query.order_by(Finding.status == "Closed", Finding.target_sla_date.asc()).limit(4)
    ).all()

    risk_query = select(Risk).where(Risk.company_id == company.id)
    if domain:
        risk_query = risk_query.where(Risk.category == domain)
    top_risks = db.scalars(risk_query.order_by(Risk.inherent_score.desc()).limit(3)).all()

    audits_query = select(Audit).where(Audit.company_id == company.id)
    if domain:
        audits_query = audits_query.where(Audit.domain == domain)
    active_audits = db.scalars(audits_query.order_by(Audit.updated_at.desc()).limit(3)).all()

    evidence_verified_count = db.scalar(
        select(func.count(Evidence.id)).where(
            Evidence.company_id == company.id,
            Evidence.verification_status == "Verified",
        )
    ) or 0
    actions_open_count = db.scalar(
        select(func.count(CorrectiveAction.id)).where(
            CorrectiveAction.company_id == company.id,
            CorrectiveAction.status != "Verified",
        )
    ) or 0

    depts = overview["departments"]
    dept_metrics = overview["dept_metrics"]
    lowest_dept: Department | None = None
    lowest_score = 999.0
    for d in depts:
        s = dept_metrics[d.id]["score"]
        if s is not None and s < lowest_score:
            lowest_score = s
            lowest_dept = d

    prompt_lower = prompt.lower()
    citations: list[dict[str, str]] = []
    for f in top_findings[:3]:
        citations.append(
            {
                "entity_type": "Finding",
                "entity_ref": f.code,
                "label": f"{f.code}: {f.title} ({f.severity}, {f.status})",
                "route": "/findings-and-actions",
            }
        )
    for r in top_risks[:2]:
        citations.append(
            {
                "entity_type": "Risk",
                "entity_ref": r.code,
                "label": f"{r.code}: {r.title} (Score {r.inherent_score} {r.severity})",
                "route": "/risk-and-compliance",
            }
        )
    for a in active_audits[:2]:
        citations.append(
            {
                "entity_type": "Audit",
                "entity_ref": a.code,
                "label": f"{a.code}: {a.title} ({a.status})",
                "route": "/audits",
            }
        )

    lines: list[str] = [
        f"**Grounded Database Synthesis for {company.legal_name}**",
        (
            f"- **Composite Compliance Readiness**: **{overview['composite_score']}%** vs. enterprise target "
            f"**{float(company.enterprise_target_score):.1f}%**. Scikit-learn linear trend slope is "
            f"**{forecast['slope_per_month']:+.2f}%/month** (R² = {forecast['r_squared']}), projecting "
            f"**{forecast['projected_next_month']}%** next cycle."
        ),
    ]

    if lowest_dept is not None:
        lines.append(
            f"- **Primary Bottleneck Division**: **{lowest_dept.name} ({lowest_dept.code})** currently averages "
            f"**{lowest_score}%** with **{dept_metrics[lowest_dept.id]['open_findings']} open findings**."
        )

    if top_findings and any(k in prompt_lower for k in ("finding", "sla", "overdue", "remediat", "risk", "priority", "summary", "executive", "prepare", "audit", "evidence")):
        finding_summary = "; ".join(f"{f.code} ({f.severity}, {f.status})" for f in top_findings[:3])
        lines.append(f"- **Priority Findings Requiring Attention**: {finding_summary}.")

    if top_risks:
        risk_summary = "; ".join(
            f"{r.code} (Inherent {r.inherent_score}/25 {r.severity}, {r.status})" for r in top_risks
        )
        lines.append(f"- **Top Inherent Risks**: {risk_summary}.")

    lines.append(
        f"- **Assurance Telemetry**: {overview['sla_compliance_pct']}% SLA compliance, "
        f"{actions_open_count} open corrective actions, and {evidence_verified_count} SHA-256 verified evidence artifacts."
    )

    return {
        "answer": "\n".join(lines),
        "citations": citations,
        "metrics_snapshot": {
            "composite_score": overview["composite_score"],
            "open_findings": overview["open_findings_count"],
            "overdue_findings": overview["overdue_findings_count"],
            "critical_high_risks": overview["critical_high_risks_count"],
            "evidence_verified_count": int(evidence_verified_count),
            "forecast_next_month": forecast["projected_next_month"],
        },
        "generated_at": datetime.now(UTC),
    }
