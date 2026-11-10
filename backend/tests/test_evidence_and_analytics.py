import hashlib
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.models.core import Company, Department, User
from tests.conftest import TEST_USER_PASSWORD, login_as


def test_evidence_upload_magic_bytes_sha256_metadata_and_history(client: TestClient) -> None:
    auditor_headers = login_as(client, "marcus.chen@companyaudit.io")
    audits = client.get("/api/audits", headers=auditor_headers).json()["items"]
    audit_id = audits[0]["id"]
    second_audit_id = audits[1]["id"]

    # 1. Reject executable / disallowed extension (.html)
    html_upload = client.post(
        "/api/evidence",
        headers=auditor_headers,
        data={"audit_id": audit_id, "tag": "Bad HTML"},
        files={"file": ("malicious.html", b"<script>alert(1)</script>", "text/html")},
    )
    assert html_upload.status_code == 415

    # 2. Reject spoofed PDF lacking %PDF- magic bytes
    fake_pdf = client.post(
        "/api/evidence",
        headers=auditor_headers,
        data={"audit_id": audit_id, "tag": "Spoof PDF"},
        files={"file": ("fake.pdf", b"NOT_A_REAL_PDF_HEADER", "application/pdf")},
    )
    assert fake_pdf.status_code == 415

    # 3. Valid PDF upload succeeds, hashes SHA-256, updates linkage before lock, downloads, and verifies
    pdf_bytes = b"%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\n%% CompanyAudit Test Artifact\n%%EOF\n"
    expected_sha = hashlib.sha256(pdf_bytes).hexdigest()

    ok_upload = client.post(
        "/api/evidence",
        headers=auditor_headers,
        data={"audit_id": audit_id, "tag": "Q4 SOC2 Proof"},
        files={"file": ("soc2_test_proof.pdf", pdf_bytes, "application/pdf")},
    )
    assert ok_upload.status_code == 201
    ev = ok_upload.json()
    assert ev["sha256_hash"] == expected_sha
    assert ev["verification_status"] == "Pending Review"
    ev_id = ev["id"]

    # Re-associate audit_id and update tag before Verification
    reassoc = client.put(
        f"/api/evidence/{ev_id}",
        headers=auditor_headers,
        json={"audit_id": second_audit_id, "tag": "Re-linked Q4 Proof"},
    )
    assert reassoc.status_code == 200
    assert reassoc.json()["audit_id"] == second_audit_id
    assert reassoc.json()["tag"] == "Re-linked Q4 Proof"

    # Download and assert bytes + headers match
    dl = client.get(f"/api/evidence/{ev_id}/download", headers=auditor_headers)
    assert dl.status_code == 200
    assert dl.content == pdf_bytes
    assert dl.headers.get("x-evidence-sha256") == expected_sha
    assert dl.headers.get("x-content-type-options") == "nosniff"

    # Verify via Auditor
    verified = client.put(
        f"/api/evidence/{ev_id}/verify",
        headers=auditor_headers,
        json={"verification_status": "Verified", "verify_file_checksum": True},
    )
    assert verified.status_code == 200
    assert verified.json()["verification_status"] == "Verified"

    # Verified evidence link change is locked while Company.sha_lock_enabled is true
    locked_reassoc = client.put(
        f"/api/evidence/{ev_id}",
        headers=auditor_headers,
        json={"audit_id": audit_id},
    )
    assert locked_reassoc.status_code == 400

    # Check chain of custody history
    ev_hist = client.get(f"/api/evidence/{ev_id}/history", headers=auditor_headers)
    assert ev_hist.status_code == 200
    assert len(ev_hist.json()) >= 3


def test_analytics_reports_filters_ai_and_history(client: TestClient) -> None:
    headers = login_as(client, "eleanor.vance@companyaudit.io")

    dash = client.get("/api/dashboard?period=Q4+2025", headers=headers)
    assert dash.status_code == 200
    body = dash.json()
    assert body["composite_score"] > 0
    assert len(body["departments"]) >= 8
    assert len(body["performance_trend"]) >= 3
    assert body["forecast"]["is_sufficient_for_forecast"] is True
    assert body["forecast"]["data_points_count"] >= 3
    assert "audit_completion_rate_pct" in body
    assert "overdue_actions_count" in body
    assert len(body["framework_compliance"]) >= 3
    assert body["evidence_breakdown"]["total"] >= 5
    assert "composite_score" in body["kpi_methodology"]
    assert len(body["risk_distribution"]["matrix"]) == 25

    # Filtered dashboard query (Technology domain only) slices honestly
    tech_dash = client.get("/api/dashboard?domain=Technology", headers=headers)
    assert tech_dash.status_code == 200
    tech_body = tech_dash.json()
    assert tech_body["total_audits_count"] < body["total_audits_count"]
    assert tech_body["forecast"]["is_sufficient_for_forecast"] is False

    dept_perf = client.get("/api/dashboard/department-performance", headers=headers)
    assert dept_perf.status_code == 200
    assert len(dept_perf.json()) >= 8

    risk_dist = client.get("/api/dashboard/risk-distribution", headers=headers)
    assert risk_dist.status_code == 200
    assert risk_dist.json()["total_risks"] >= 5

    reports = client.get("/api/reports", headers=headers)
    assert reports.status_code == 200
    assert len(reports.json()) == 6

    rep_detail = client.get("/api/reports/rep-risk?period=Q4+2025", headers=headers)
    assert rep_detail.status_code == 200
    assert len(rep_detail.json()["csv_rows"]) >= 5

    ai_resp = client.post(
        "/api/reports/ai-synthesis",
        headers=headers,
        json={"prompt": "Summarize top priority findings and SLA risks"},
    )
    assert ai_resp.status_code == 200
    ai_data = ai_resp.json()
    assert ai_data["provider_status"] == "unavailable"
    assert len(ai_data["verified_facts"]) >= 3
    assert len(ai_data["recommendations"]) >= 1
    assert len(ai_data["citations"]) >= 1

    search_resp = client.get("/api/search?q=AWS", headers=headers)
    assert search_resp.status_code == 200
    assert search_resp.json()["total"] >= 1

    hist_resp = client.get("/api/history", headers=headers)
    assert hist_resp.status_code == 200
    assert hist_resp.json()["total"] >= 4

    for domain in ("financial", "hr", "project", "customer"):
        dom_resp = client.get(f"/api/domains/{domain}/telemetry", headers=headers)
        assert dom_resp.status_code == 200


def test_multi_company_tenant_isolation_and_empty_forecast_honesty(
    client: TestClient,
    db_session: Session,
) -> None:
    comp_b = Company(
        id=uuid4(),
        legal_name="Isolated Rival Corp",
        ticker="RVAL",
        fiscal_year_label="FY 2025",
    )
    db_session.add(comp_b)
    db_session.flush()

    dept_b = Department(company_id=comp_b.id, code="SEC-B", name="Tenant B SecOps")
    db_session.add(dept_b)
    db_session.flush()

    user_b = User(
        company_id=comp_b.id,
        department_id=dept_b.id,
        email="admin@rivalcorp.example",
        password_hash=hash_password(TEST_USER_PASSWORD),
        full_name="Tenant B Admin",
        role="Admin",
        is_active=True,
    )
    db_session.add(user_b)
    db_session.commit()

    tenant_a_headers = login_as(client, "eleanor.vance@companyaudit.io")
    tenant_b_token = create_access_token(
        user_id=user_b.id,
        company_id=comp_b.id,
        role="Admin",
        token_version=user_b.token_version,
    )
    tenant_b_headers = {"Authorization": f"Bearer {tenant_b_token}"}

    a_audits = client.get("/api/audits", headers=tenant_a_headers).json()["items"]
    assert len(a_audits) >= 5

    b_audits = client.get("/api/audits", headers=tenant_b_headers).json()["items"]
    assert len(b_audits) == 0

    cross_fetch = client.get(f"/api/audits/{a_audits[0]['id']}", headers=tenant_b_headers)
    assert cross_fetch.status_code == 404

    # Empty tenant dashboard must NOT fabricate synthetic monthly history!
    b_dash = client.get("/api/dashboard", headers=tenant_b_headers)
    assert b_dash.status_code == 200
    b_body = b_dash.json()
    assert b_body["performance_trend"] == []
    assert b_body["forecast"]["is_sufficient_for_forecast"] is False
    assert b_body["forecast"]["data_points_count"] == 0
