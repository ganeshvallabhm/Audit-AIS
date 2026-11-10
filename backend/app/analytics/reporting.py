import csv
from datetime import UTC, datetime
import io
import json
from typing import Any
from uuid import UUID

from fastapi import HTTPException, Request, status
from fpdf import FPDF
import httpx
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.forecasting import build_performance_trend_and_forecast
from app.analytics.scoring_analytics import (
    build_company_overview_numbers,
    compute_sla_metrics,
)
from app.core.config import get_settings
from app.models.audit import Audit
from app.models.core import Company, Department, User
from app.models.governance import CorrectiveAction, Evidence, Finding, Risk
from app.services.audit_history import record_audit_history

REPORT_SUITES_CATALOG: list[dict[str, Any]] = [
    {
        "id": "rep-board",
        "title": "Executive Board Audit Package",
        "description": "High-level fiduciary synthesis, audit opinion letter, key risk indicators, and board committee sign-offs.",
        "updated_at": "Live Database Snapshot",
        "on_demand": False,
        "tags": ["Quarterly", "Executive & Board"],
        "format_tag": "PDF + XLSX + CSV",
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
        "format_tag": "PDF + XLSX + CSV",
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
        "format_tag": "PDF + XLSX + CSV",
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
        "format_tag": "XLSX + PDF + CSV",
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
        "format_tag": "PDF + XLSX + CSV",
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


def _pdf_safe(value: Any) -> str:
    txt = str(value if value is not None else "")
    replacements = {
        "—": "-",
        "–": "-",
        "•": "*",
        "²": "^2",
        "“": '"',
        "”": '"',
        "‘": "'",
        "’": "'",
        "€": "EUR ",
        "£": "GBP ",
    }
    for src, dst in replacements.items():
        txt = txt.replace(src, dst)
    return txt.encode("latin-1", errors="replace").decode("latin-1")


def get_report_suites() -> list[dict[str, Any]]:
    return REPORT_SUITES_CATALOG


def build_report_detail(
    db: Session,
    company: Company,
    report_id: str,
    *,
    period: str = "Q4 2025",
) -> dict[str, Any]:
    suite = next((s for s in REPORT_SUITES_CATALOG if s["id"] == report_id), None)
    if suite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report suite '{report_id}' not found.",
        )

    overview = build_company_overview_numbers(db, company, period=period)
    d_from, d_to = overview["date_bounds"]
    _, forecast = build_performance_trend_and_forecast(
        db,
        company.id,
        live_composite_score=overview["composite_score"],
        enterprise_target=float(company.enterprise_target_score),
        period=period,
        d_from=d_from,
        d_to=d_to,
    )

    audits = db.scalars(select(Audit).where(Audit.company_id == company.id).order_by(Audit.code)).all()
    filtered_audit_ids = overview["filtered_audit_ids"]
    audits = [a for a in audits if a.id in filtered_audit_ids]

    risks = db.scalars(select(Risk).where(Risk.company_id == company.id).order_by(Risk.inherent_score.desc())).all()
    findings = db.scalars(select(Finding).where(Finding.company_id == company.id).order_by(Finding.code)).all()
    filtered_finding_ids = overview["filtered_finding_ids"]
    findings = [f for f in findings if f.id in filtered_finding_ids]

    departments = overview["departments"]
    dept_metrics = overview["dept_metrics"]

    if report_id == "rep-risk":
        csv_headers = ["Risk Code", "Title", "Category", "Probability", "Impact", "Inherent Score", "Severity", "Status"]
        csv_rows = [
            [r.code, r.title, r.category, r.probability, r.impact, r.inherent_score, r.severity, r.status]
            for r in risks
        ]
        summary = (
            f"Active enterprise risk portfolio ({period}) comprises {len(risks)} tracked exposures across {len(departments)} business units; "
            f"{overview['critical_high_risks_count']} are classified Critical or High severity."
        )
    elif report_id == "rep-sla":
        csv_headers = ["Finding Code", "Title", "Severity", "Status", "Target SLA Date"]
        csv_rows = [
            [f.code, f.title, f.severity, f.status, str(f.target_sla_date)]
            for f in findings
        ]
        summary = (
            f"Remediation SLA compliance ({period}) stands at {overview['sla_compliance_pct']}% across {len(findings)} findings "
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
            f"Weighted enterprise readiness ({period}) across {len(departments)} divisions is {overview['composite_score']}% "
            f"against the {float(company.enterprise_target_score):.1f}% statutory target."
        )
    elif report_id == "rep-statutory":
        fw_rows = overview["framework_compliance"]
        csv_headers = ["Framework", "Total Controls", "Evaluated Controls", "Weighted Score (%)", "Compliance Status"]
        csv_rows = [
            [fw["framework"], fw["controls_total"], fw["controls_evaluated"], fw["score"], fw["status"]]
            for fw in fw_rows
        ]
        summary = (
            f"Statutory cross-walk ({period}) covers {len(fw_rows)} active frameworks across {len(audits)} audit engagements "
            f"with weighted readiness of {overview['composite_score']}%."
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
            f"{company.legal_name} ({period}) maintains {overview['composite_score']}% weighted compliance readiness across "
            f"{overview['total_audits_count']} audits with {forecast['slope_per_month']:+.2f}% monthly convergence slope "
            f"(R^2 = {forecast['r_squared']})."
        )

    return {
        "id": suite["id"],
        "title": suite["title"],
        "generated_at": datetime.now(UTC),
        "company_name": company.legal_name,
        "fiscal_year": f"{company.fiscal_year_label} • {period}",
        "executive_summary": summary,
        "kpis": {
            "composite_score": overview["composite_score"],
            "enterprise_target": float(company.enterprise_target_score),
            "open_findings": overview["open_findings_count"],
            "overdue_findings": overview["overdue_findings_count"],
            "critical_high_risks": overview["critical_high_risks_count"],
            "sla_compliance_pct": overview["sla_compliance_pct"],
            "forecast_next_month": forecast["projected_next_month"],
            "audit_completion_rate_pct": overview["audit_completion_rate_pct"],
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
        "_departments": departments,
        "_dept_metrics": dept_metrics,
    }


def generate_report_export(
    db: Session,
    company: Company,
    report_id: str,
    export_format: str,
    *,
    period: str = "Q4 2025",
) -> tuple[bytes, str, str]:
    detail = build_report_detail(db, company, report_id, period=period)
    slug = period.lower().replace(" ", "_").replace("/", "-")
    base_name = f"companyaudit_{report_id}_{slug}"

    if export_format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(detail["csv_headers"])
        writer.writerows(detail["csv_rows"])
        return buf.getvalue().encode("utf-8"), "text/csv; charset=utf-8", f"{base_name}.csv"

    if export_format == "xlsx":
        wb = Workbook()
        header_fill = PatternFill(start_color="000615", end_color="000615", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True, size=11)
        sub_fill = PatternFill(start_color="EFF4FF", end_color="EFF4FF", fill_type="solid")

        ws_sum = wb.active
        ws_sum.title = "Executive Summary"
        ws_sum.append(["CompanyAudit Enterprise Analytics Export"])
        ws_sum["A1"].font = Font(size=14, bold=True, color="0051D5")
        ws_sum.append(["Organization", detail["company_name"]])
        ws_sum.append(["Report Suite", detail["title"]])
        ws_sum.append(["Fiscal Scope", detail["fiscal_year"]])
        ws_sum.append(["Generated At (UTC)", detail["generated_at"].isoformat()])
        ws_sum.append([])
        ws_sum.append(["Executive Narrative", detail["executive_summary"]])
        ws_sum["B7"].alignment = Alignment(wrap_text=True)
        ws_sum.append([])
        ws_sum.append(["KPI Metric", "Value"])
        ws_sum["A9"].fill = header_fill
        ws_sum["A9"].font = header_font
        ws_sum["B9"].fill = header_fill
        ws_sum["B9"].font = header_font
        for k, v in detail["kpis"].items():
            ws_sum.append([k.replace("_", " ").title(), v])
        ws_sum.column_dimensions["A"].width = 30
        ws_sum.column_dimensions["B"].width = 80

        ws_data = wb.create_sheet("Report Dataset")
        ws_data.append(detail["csv_headers"])
        for cell in ws_data[1]:
            cell.fill = header_fill
            cell.font = header_font
        for idx, row in enumerate(detail["csv_rows"], start=2):
            ws_data.append(list(row))
            if idx % 2 == 1:
                for cell in ws_data[idx]:
                    cell.fill = sub_fill
        for col in ws_data.columns:
            max_len = max((len(str(c.value or "")) for c in col), default=10)
            ws_data.column_dimensions[col[0].column_letter].width = min(max_len + 5, 48)

        ws_dept = wb.create_sheet("Departmental Scorecard")
        dept_headers = ["Code", "Department", "Composite Score (%)", "Target (%)", "Active Audits", "Open Findings", "Attention Area"]
        ws_dept.append(dept_headers)
        for cell in ws_dept[1]:
            cell.fill = header_fill
            cell.font = header_font
        dm = detail["_dept_metrics"]
        for d in detail["_departments"]:
            m = dm.get(d.id, {})
            ws_dept.append([
                d.code,
                d.name,
                m.get("score") if m.get("score") is not None else "N/A",
                float(d.target_score),
                m.get("active_audits", 0),
                m.get("open_findings", 0),
                "Yes" if m.get("attention_area") else "No",
            ])
        for col in ws_dept.columns:
            max_len = max((len(str(c.value or "")) for c in col), default=10)
            ws_dept.column_dimensions[col[0].column_letter].width = min(max_len + 5, 42)

        out = io.BytesIO()
        wb.save(out)
        return (
            out.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            f"{base_name}.xlsx",
        )

    if export_format == "pdf":
        pdf = FPDF(orientation="L", unit="mm", format="A4")
        pdf.set_auto_page_break(auto=True, margin=14)
        pdf.add_page()

        # Header banner
        pdf.set_fill_color(0, 6, 21)
        pdf.rect(0, 0, 297, 24, style="F")
        pdf.set_xy(12, 6)
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 7, _pdf_safe(f"CompanyAudit  |  {detail['title']}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_x(12)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(200, 215, 255)
        pdf.cell(
            0,
            5,
            _pdf_safe(f"{detail['company_name']}   |   {detail['fiscal_year']}   |   UTC {detail['generated_at'].strftime('%Y-%m-%d %H:%M')}"),
            new_x="LMARGIN",
            new_y="NEXT",
        )

        pdf.set_y(30)
        pdf.set_text_color(0, 6, 21)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, "Executive Summary", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9.5)
        pdf.multi_cell(0, 5.2, _pdf_safe(detail["executive_summary"]))
        pdf.ln(3)

        # KPI Strip
        kpis = detail["kpis"]
        kpi_cards = [
            ("Composite Score", f"{kpis['composite_score']}% (Target {kpis['enterprise_target']}%)"),
            ("SLA On-Time Rate", f"{kpis['sla_compliance_pct']}%"),
            ("Open / Overdue Findings", f"{kpis['open_findings']} / {kpis['overdue_findings']}"),
            ("Critical & High Risks", f"{kpis['critical_high_risks']}"),
        ]
        card_w = 66
        start_x = 12
        y_top = pdf.get_y()
        for idx, (label, val) in enumerate(kpi_cards):
            x = start_x + idx * (card_w + 3)
            pdf.set_fill_color(239, 244, 255)
            pdf.rect(x, y_top, card_w, 15, style="F")
            pdf.set_xy(x + 3, y_top + 2.5)
            pdf.set_font("Helvetica", "B", 7.5)
            pdf.set_text_color(70, 90, 130)
            pdf.cell(card_w - 6, 4, _pdf_safe(label.upper()), new_x="LEFT", new_y="NEXT")
            pdf.set_xy(x + 3, y_top + 7)
            pdf.set_font("Helvetica", "B", 10.5)
            pdf.set_text_color(0, 6, 21)
            pdf.cell(card_w - 6, 6, _pdf_safe(val))

        pdf.set_y(y_top + 20)
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.cell(0, 7, "Detailed Governance Register", new_x="LMARGIN", new_y="NEXT")

        headers = detail["csv_headers"]
        rows = detail["csv_rows"]
        usable_w = 273.0
        col_w = usable_w / max(1, len(headers))

        pdf.set_fill_color(0, 81, 213)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 8.5)
        for h in headers:
            pdf.cell(col_w, 7, _pdf_safe(str(h)[:28]), border=0, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(0, 6, 21)
        for idx, row in enumerate(rows[:60]):
            if idx % 2 == 1:
                pdf.set_fill_color(245, 248, 255)
                fill_row = True
            else:
                fill_row = False
            for val in row:
                txt = _pdf_safe(val)
                if len(txt) > 36:
                    txt = txt[:33] + "..."
                pdf.cell(col_w, 6.2, txt, border="B", fill=fill_row)
            pdf.ln()

        return bytes(pdf.output()), "application/pdf", f"{base_name}.pdf"

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported export format '{export_format}'. Supported: csv, xlsx, pdf.",
    )


def _call_external_llm(
    *,
    provider: str,
    api_key: str,
    model: str | None,
    prompt: str,
    context_payload: dict[str, Any],
) -> tuple[str | None, str | None]:
    """
    Bounded synchronous call to an optional server-side LLM provider.
    Passes only strict tenant-scoped verified database telemetry as grounding context.
    Returns (answer_text, error_reason).
    """
    system_prompt = (
        "You are an enterprise governance & audit synthesis engine. Rely strictly on the verified JSON telemetry supplied. "
        "Cite exact entity codes (e.g., AUD-..., FND-..., RSK-...). Do not invent figures or entities."
    )
    user_content = f"Question: {prompt}\n\nVerified Telemetry Context:\n{json.dumps(context_payload, default=str)}"

    try:
        with httpx.Client(timeout=12.0) as client:
            if provider == "openai":
                chosen_model = model or "gpt-4o-mini"
                resp = client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": chosen_model,
                        "temperature": 0.1,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_content},
                        ],
                    },
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"], None

            if provider == "anthropic":
                chosen_model = model or "claude-3-5-haiku-latest"
                resp = client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                    json={
                        "model": chosen_model,
                        "max_tokens": 700,
                        "system": system_prompt,
                        "messages": [{"role": "user", "content": user_content}],
                    },
                )
                resp.raise_for_status()
                return resp.json()["content"][0]["text"], None

            if provider == "gemini":
                chosen_model = model or "gemini-2.5-flash"
                resp = client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{chosen_model}:generateContent",
                    params={"key": api_key},
                    json={
                        "contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_content}"}]}],
                    },
                )
                resp.raise_for_status()
                return resp.json()["candidates"][0]["content"]["parts"][0]["text"], None
    except Exception as exc:
        return None, str(exc)

    return None, f"Unsupported AI provider '{provider}'."


def generate_grounded_ai_synthesis(
    db: Session,
    company: Company,
    current_user: User,
    prompt: str,
    domain: str | None = None,
    request: Request | None = None,
) -> dict[str, Any]:
    """
    Produces a grounded executive governance synthesis directly from PostgreSQL records
    with strict Department Head RBAC scoping, explicit verified facts vs recommendations,
    and honest external LLM availability reporting.
    """
    dept_scope_id: UUID | None = current_user.department_id if current_user.role == "Department Head" else None
    scoped_dept_name: str | None = None
    if dept_scope_id is not None:
        scoped_dept = db.get(Department, dept_scope_id)
        scoped_dept_name = f"{scoped_dept.name} ({scoped_dept.code})" if scoped_dept else str(dept_scope_id)

    overview = build_company_overview_numbers(
        db,
        company,
        department_id=dept_scope_id,
        domain=domain,
    )
    _, forecast = build_performance_trend_and_forecast(
        db,
        company.id,
        live_composite_score=overview["composite_score"],
        enterprise_target=float(company.enterprise_target_score),
        department_id=dept_scope_id,
        domain=domain,
    )

    findings_query = select(Finding).where(Finding.company_id == company.id)
    if dept_scope_id is not None:
        findings_query = findings_query.where(Finding.department_id == dept_scope_id)
    if domain:
        findings_query = findings_query.join(Audit, Audit.id == Finding.audit_id).where(Audit.domain == domain)
    top_findings = list(
        db.scalars(
            findings_query.order_by(Finding.status == "Closed", Finding.target_sla_date.asc()).limit(5)
        ).all()
    )

    risk_query = select(Risk).where(Risk.company_id == company.id)
    if dept_scope_id is not None:
        risk_query = risk_query.where(Risk.department_id == dept_scope_id)
    if domain:
        risk_query = risk_query.where(Risk.category == domain)
    top_risks = list(db.scalars(risk_query.order_by(Risk.inherent_score.desc()).limit(4)).all())

    audits_query = select(Audit).where(Audit.company_id == company.id)
    if dept_scope_id is not None:
        audits_query = audits_query.where(Audit.department_id == dept_scope_id)
    if domain:
        audits_query = audits_query.where(Audit.domain == domain)
    active_audits = list(db.scalars(audits_query.order_by(Audit.updated_at.desc()).limit(4)).all())

    evidence_verified_count = overview["evidence_breakdown"]["verified"]
    sla_scoped = compute_sla_metrics(
        db,
        company.id,
        findings=top_findings if not dept_scope_id else list(
            db.scalars(select(Finding).where(Finding.company_id == company.id, Finding.department_id == dept_scope_id)).all()
        ),
    )
    actions_open_count = (
        db.scalar(
            select(func.count(CorrectiveAction.id))
            .outerjoin(Finding, Finding.id == CorrectiveAction.finding_id)
            .outerjoin(Risk, Risk.id == CorrectiveAction.risk_id)
            .where(
                CorrectiveAction.company_id == company.id,
                CorrectiveAction.status != "Verified",
                *(
                    [(Finding.department_id == dept_scope_id) | (Risk.department_id == dept_scope_id)]
                    if dept_scope_id is not None
                    else []
                ),
            )
        )
        or 0
    )

    depts = overview["departments"]
    dept_metrics = overview["dept_metrics"]
    lowest_dept: Department | None = None
    lowest_score = 999.0
    for d in depts:
        s = dept_metrics[d.id]["score"]
        if s is not None and s < lowest_score:
            lowest_score = s
            lowest_dept = d

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

    scope_label = scoped_dept_name or company.legal_name
    verified_facts: list[str] = [
        f"Scoped Readiness ({scope_label}): {overview['composite_score']}% against {float(company.enterprise_target_score):.1f}% statutory target.",
        f"Audit Velocity: {overview['completed_audits_count']} of {overview['total_audits_count']} audits closed ({overview['audit_completion_rate_pct']}% completion rate); {overview['sla_compliance_pct']}% SLA compliance.",
        f"Assurance Posture: {overview['open_findings_count']} open findings ({overview['overdue_findings_count']} overdue), {actions_open_count} open corrective actions, and {evidence_verified_count} SHA-256 verified evidence artifacts.",
    ]
    if forecast["is_sufficient_for_forecast"]:
        verified_facts.append(
            f"OLS Trend: {forecast['slope_per_month']:+.2f}%/month across {forecast['data_points_count']} months (R^2 = {forecast['r_squared']}), projecting {forecast['projected_next_month']}% next cycle."
        )
    else:
        verified_facts.append(f"Forecast Status: {forecast['confidence_label']} — no linear extrapolation generated.")

    if lowest_dept is not None and not dept_scope_id:
        verified_facts.append(
            f"Bottleneck Division: {lowest_dept.name} ({lowest_dept.code}) averages {lowest_score}% with {dept_metrics[lowest_dept.id]['open_findings']} open findings."
        )
    if top_findings:
        verified_facts.append(
            "Priority Findings: " + "; ".join(f"{f.code} ({f.severity}, {f.status}, SLA {f.target_sla_date})" for f in top_findings[:3]) + "."
        )
    if top_risks:
        verified_facts.append(
            "Top Inherent Risks: " + "; ".join(f"{r.code} ({r.inherent_score}/25 {r.severity}, {r.status})" for r in top_risks[:3]) + "."
        )

    recommendations: list[str] = []
    overdue_items = [f for f in top_findings if f.status == "Overdue" or f.target_sla_date < datetime.now(UTC).date()]
    if overdue_items:
        recommendations.append(
            f"Prioritize immediate remediation closure on overdue finding(s): {', '.join(f.code for f in overdue_items)}."
        )
    crit_risks = [r for r in top_risks if r.severity == "Critical" and r.status != "Mitigated"]
    if crit_risks:
        recommendations.append(
            f"Verify compensating controls and board committee review dates for Critical exposure(s): {', '.join(r.code for r in crit_risks)}."
        )
    if overview["evidence_breakdown"]["flagged"] > 0:
        recommendations.append(
            f"Resolve {overview['evidence_breakdown']['flagged']} Flagged evidence artifact(s) in Evidence Vault before closing dependent findings."
        )
    if not recommendations:
        recommendations.append("Maintain scheduled checklist test cadence across active audits to sustain readiness above target.")

    settings = get_settings()
    provider_status = "unavailable"
    provider_name = "PostgreSQL Telemetry Synthesizer (No External LLM Configured)"
    provider_message = (
        "External LLM provider unavailable (AI_PROVIDER / AI_API_KEY not configured). "
        "All facts below are deterministic computations directly from PostgreSQL."
    )
    llm_narrative: str | None = None

    if settings.ai_provider and settings.ai_api_key:
        context_payload = {
            "scope": scope_label,
            "verified_facts": verified_facts,
            "citations": citations,
        }
        llm_text, err_msg = _call_external_llm(
            provider=settings.ai_provider,
            api_key=settings.ai_api_key,
            model=settings.ai_model,
            prompt=prompt,
            context_payload=context_payload,
        )
        if llm_text:
            provider_status = "live_llm"
            provider_name = f"{settings.ai_provider.upper()} ({settings.ai_model or 'default'}) + PostgreSQL Grounding"
            provider_message = "Grounded synthesis generated via live external LLM constrained to scoped PostgreSQL telemetry."
            llm_narrative = llm_text
        else:
            provider_status = "unavailable"
            provider_name = f"PostgreSQL Telemetry Fallback ({settings.ai_provider} error)"
            provider_message = f"External LLM call failed ({err_msg}); showing verified PostgreSQL facts only."

    answer_sections = [f"**Verified Database Synthesis — {scope_label}**"]
    if llm_narrative:
        answer_sections.append(llm_narrative.strip())
    answer_sections.append("**Verified PostgreSQL Facts**")
    answer_sections.extend(f"- {fact}" for fact in verified_facts)
    answer_sections.append("**Prioritized Governance Actions**")
    answer_sections.extend(f"- {rec}" for rec in recommendations)

    record_audit_history(
        db,
        company_id=company.id,
        actor=current_user,
        category="System",
        module="AI Audit Assistant",
        entity_type="Company",
        entity_id=company.id,
        entity_ref=scoped_dept_name or (company.ticker or "CORP"),
        action=f"Executed grounded AI governance synthesis query (provider: {provider_status})",
        changes={
            "domain": domain,
            "scoped_department": scoped_dept_name,
            "provider_status": provider_status,
            "citations_count": len(citations),
        },
        request=request,
    )

    return {
        "answer": "\n".join(answer_sections),
        "verified_facts": verified_facts,
        "recommendations": recommendations,
        "provider_status": provider_status,
        "provider_name": provider_name,
        "provider_message": provider_message,
        "scoped_department": scoped_dept_name,
        "citations": citations,
        "metrics_snapshot": {
            "composite_score": overview["composite_score"],
            "open_findings": overview["open_findings_count"],
            "overdue_findings": overview["overdue_findings_count"],
            "critical_high_risks": overview["critical_high_risks_count"],
            "evidence_verified_count": int(evidence_verified_count),
            "forecast_next_month": forecast["projected_next_month"],
            "sla_compliance_pct": sla_scoped["sla_compliance_pct"],
        },
        "generated_at": datetime.now(UTC),
    }
