from datetime import date, timedelta
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.core import Company, Department
from app.models.telemetry import AuditHistory
from app.services.audit_history import record_audit_history, verify_company_history_chain
from tests.conftest import login_as


def test_department_delete_protection_and_unreferenced_delete(client: TestClient) -> None:
    admin_headers = login_as(client, "eleanor.vance@companyaudit.io")
    depts = client.get("/api/departments", headers=admin_headers).json()
    referenced = next(d for d in depts if d["code"] == "ITS-04")

    # Referenced department deletion returns 409 Conflict
    del_conflict = client.delete(f"/api/departments/{referenced['id']}", headers=admin_headers)
    assert del_conflict.status_code == 409

    # Create unreferenced department and delete it cleanly
    created = client.post(
        "/api/departments",
        headers=admin_headers,
        json={"code": "TMP-99", "name": "Temporary Audit Sandbox", "target_score": 85, "scoring_weight": 0.05},
    )
    assert created.status_code == 201
    tmp_id = created.json()["id"]

    del_ok = client.delete(f"/api/departments/{tmp_id}", headers=admin_headers)
    assert del_ok.status_code == 200


def test_audit_scopes_and_checklists_crud(client: TestClient) -> None:
    auditor_headers = login_as(client, "marcus.chen@companyaudit.io")
    depts = client.get("/api/departments", headers=auditor_headers).json()
    dept_id = depts[0]["id"]

    audit_resp = client.post(
        "/api/audits",
        headers=auditor_headers,
        json={
            "title": "Phase 4 Scope & Checklist CRUD Audit",
            "domain": "Financial",
            "department_id": dept_id,
            "framework": "SOX 404",
            "status": "Draft",
        },
    )
    assert audit_resp.status_code == 201
    audit_id = audit_resp.json()["id"]

    # Add -> Update -> Delete audit scope
    s_add = client.post(
        f"/api/audits/{audit_id}/scopes",
        headers=auditor_headers,
        json={"scope_name": "SAP Treasury", "system_or_process": "Wire Portal", "regulatory_clause": "SOX 404.2", "in_scope": True},
    )
    assert s_add.status_code == 201
    scope_id = s_add.json()["id"]

    s_upd = client.put(
        f"/api/audits/{audit_id}/scopes/{scope_id}",
        headers=auditor_headers,
        json={"in_scope": False},
    )
    assert s_upd.status_code == 200
    assert s_upd.json()["in_scope"] is False

    s_del = client.delete(f"/api/audits/{audit_id}/scopes/{scope_id}", headers=auditor_headers)
    assert s_del.status_code == 200

    # Create Checklist -> Item -> Update Item
    chk = client.post(
        "/api/checklists",
        headers=auditor_headers,
        json={"title": "Custom Treasury Controls", "domain": "Financial", "framework": "COSO 2013", "version": "1.2"},
    )
    assert chk.status_code == 201
    chk_id = chk.json()["id"]

    item = client.post(
        f"/api/checklists/{chk_id}/items",
        headers=auditor_headers,
        json={
            "control_code": "TRES-901",
            "title": "Dual Bank Token Verification",
            "test_procedure": "Verify YubiKey approvals for wire batches >$100k.",
            "weight": 2.0,
            "display_order": 1,
        },
    )
    assert item.status_code == 201
    item_id = item.json()["id"]

    item_upd = client.put(
        f"/api/checklist-items/{item_id}",
        headers=auditor_headers,
        json={"weight": 2.5},
    )
    assert item_upd.status_code == 200
    assert item_upd.json()["weight"] == 2.5


def test_finding_verification_reject_reopen_and_delete_guard(client: TestClient) -> None:
    auditor_headers = login_as(client, "marcus.chen@companyaudit.io")
    admin_headers = login_as(client, "eleanor.vance@companyaudit.io")
    kane_headers = login_as(client, "marcus.kane@companyaudit.io")

    depts = client.get("/api/departments", headers=admin_headers).json()
    its_dept = next(d for d in depts if d["code"] == "ITS-04")
    audits = client.get("/api/audits", headers=admin_headers).json()["items"]
    tech_audit = next(a for a in audits if a["department_code"] == "ITS-04")

    f_resp = client.post(
        "/api/findings",
        headers=auditor_headers,
        json={
            "audit_id": tech_audit["id"],
            "department_id": its_dept["id"],
            "title": "EKS Pod Security Context Finding",
            "root_cause": "Missing non-root security context enforcement in staging.",
            "severity": "Medium",
            "target_sla_date": str(date.today() + timedelta(days=10)),
        },
    )
    assert f_resp.status_code == 201
    f_id = f_resp.json()["id"]

    # Department Head submits remediation response & marks Verification Pending
    submit_ver = client.put(
        f"/api/findings/{f_id}",
        headers=kane_headers,
        json={"management_response": "PSP admission policy deployed.", "status": "Verification Pending"},
    )
    assert submit_ver.status_code == 200
    assert submit_ver.json()["status"] == "Verification Pending"

    # Reject verification without rejection_reason -> 422
    bad_reject = client.put(
        f"/api/findings/{f_id}",
        headers=auditor_headers,
        json={"status": "In Progress"},
    )
    assert bad_reject.status_code == 422

    # Valid rejection reopens to In Progress with reason preserved
    ok_reject = client.put(
        f"/api/findings/{f_id}",
        headers=auditor_headers,
        json={"status": "In Progress", "rejection_reason": "Attach CloudTrail admission log proof before closing."},
    )
    assert ok_reject.status_code == 200
    assert ok_reject.json()["status"] == "In Progress"
    assert "CloudTrail" in ok_reject.json()["rejection_reason"]

    # Delete non-closed finding works; closed findings cannot be deleted
    f2_resp = client.post(
        "/api/findings",
        headers=auditor_headers,
        json={
            "audit_id": tech_audit["id"],
            "department_id": its_dept["id"],
            "title": "Closed Guard Finding",
            "root_cause": "Temporary verification check.",
            "severity": "Low",
            "target_sla_date": str(date.today() + timedelta(days=5)),
        },
    )
    f2_id = f2_resp.json()["id"]
    assert client.put(f"/api/findings/{f2_id}", headers=admin_headers, json={"sign_off": True}).status_code == 200
    assert client.delete(f"/api/findings/{f2_id}", headers=admin_headers).status_code == 400
    assert client.delete(f"/api/findings/{f_id}", headers=admin_headers).status_code == 200


def test_risk_escalation_report_exports_distributions_sla_and_hash_chain(
    client: TestClient,
    db_session: Session,
) -> None:
    admin_headers = login_as(client, "eleanor.vance@companyaudit.io")

    # 1. Risk escalation
    risks = client.get("/api/risks", headers=admin_headers).json()["items"]
    esc = client.post(
        f"/api/risks/{risks[0]['id']}/escalate",
        headers=admin_headers,
        json={"escalation_target": "Full Board Audit Committee", "note": "Escalated for immediate budget clearance."},
    )
    assert esc.status_code == 200
    assert esc.json()["escalation_target"] == "Full Board Audit Committee"

    # 2. Binary Exports (CSV, XLSX, PDF)
    csv_exp = client.get("/api/reports/rep-board/export?format=csv&period=Q4+2025", headers=admin_headers)
    assert csv_exp.status_code == 200
    assert "text/csv" in csv_exp.headers["content-type"]
    assert "Audit Code" in csv_exp.text

    xlsx_exp = client.get("/api/reports/rep-board/export?format=xlsx&period=Q4+2025", headers=admin_headers)
    assert xlsx_exp.status_code == 200
    wb = load_workbook(BytesIO(xlsx_exp.content))
    assert set(["Executive Summary", "Report Dataset", "Departmental Scorecard"]).issubset(set(wb.sheetnames))

    pdf_exp = client.get("/api/reports/rep-risk/export?format=pdf&period=Q4+2025", headers=admin_headers)
    assert pdf_exp.status_code == 200
    assert pdf_exp.headers["content-type"] == "application/pdf"
    assert pdf_exp.content.startswith(b"%PDF-")

    # 3. DB-persisted Distribution Rules CRUD
    rules = client.get("/api/reports/distributions", headers=admin_headers)
    assert rules.status_code == 200
    assert len(rules.json()) >= 3

    created_rule = client.post(
        "/api/reports/distributions",
        headers=admin_headers,
        json={
            "name": "Phase 4 Daily Exception Alert",
            "schedule_label": "Daily 07:00 UTC",
            "recipients": "cao@companyaudit.io",
            "report_suite_id": "rep-sla",
            "export_format": "xlsx",
        },
    )
    assert created_rule.status_code == 201
    rule_id = created_rule.json()["id"]
    upd_rule = client.put(
        f"/api/reports/distributions/{rule_id}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert upd_rule.status_code == 200
    assert upd_rule.json()["is_active"] is False
    assert client.delete(f"/api/reports/distributions/{rule_id}", headers=admin_headers).status_code == 200

    # 4. Deduplicated SLA Sweep idempotency
    sweep1 = client.post("/api/notifications/run-sla-sweep", headers=admin_headers)
    assert sweep1.status_code == 200
    sweep2 = client.post("/api/notifications/run-sla-sweep", headers=admin_headers)
    assert sweep2.status_code == 200
    assert sweep2.json()["notifications_created"] == 0

    # 5. Hash-chained AuditHistory verification (clean)
    verify = client.get("/api/history/verify", headers=admin_headers)
    assert verify.status_code == 200
    assert verify.json()["valid"] is True
    assert verify.json()["genesis_ok"] is True
    assert verify.json()["checked_events"] == verify.json()["total_events"]

    # 6. Tamper detection test in isolated Company C
    comp_c = Company(id=uuid4(), legal_name="Chain Tamper Probe Ltd", ticker="TMPR", fiscal_year_label="FY 2025")
    db_session.add(comp_c)
    db_session.flush()
    record_audit_history(
        db_session,
        company_id=comp_c.id,
        actor=None,
        category="System",
        module="Audit",
        entity_type="Company",
        entity_id=comp_c.id,
        entity_ref="TMPR",
        action="Genesis event",
    )
    db_session.flush()
    record_audit_history(
        db_session,
        company_id=comp_c.id,
        actor=None,
        category="Mutation",
        module="Audit",
        entity_type="Company",
        entity_id=comp_c.id,
        entity_ref="TMPR",
        action="Second event",
    )
    db_session.flush()
    assert verify_company_history_chain(db_session, comp_c.id)["valid"] is True

    # Simulate direct database row tamper on genesis action text
    genesis_row = db_session.scalars(
        select(AuditHistory).where(AuditHistory.company_id == comp_c.id, AuditHistory.prev_event_sha256.is_(None))
    ).first()
    assert genesis_row is not None
    genesis_row.action = "Tampered genesis action"
    db_session.flush()
    tampered_res = verify_company_history_chain(db_session, comp_c.id)
    assert tampered_res["valid"] is False
    assert genesis_row.id in tampered_res["broken_event_ids"]
    db_session.rollback()

