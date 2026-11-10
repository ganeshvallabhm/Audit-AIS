import hashlib
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.models.core import Company, Department, User
from tests.conftest import TEST_USER_PASSWORD, login_as


def test_evidence_upload_magic_bytes_sha256_and_download(client: TestClient) -> None:
    auditor_headers = login_as(client, "marcus.chen@companyaudit.io")
    audits = client.get("/api/audits", headers=auditor_headers).json()["items"]
    audit_id = audits[0]["id"]

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

    # 3. Valid PDF upload succeeds, hashes SHA-256, downloads, and verifies
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


def test_analytics_reports_search_telemetry_and_history(client: TestClient) -> None:
    headers = login_as(client, "eleanor.vance@companyaudit.io")

    dash = client.get("/api/dashboard?period=Q4+2025", headers=headers)
    assert dash.status_code == 200
    body = dash.json()
    assert body["composite_score"] > 0
    assert len(body["departments"]) >= 8
    assert len(body["performance_trend"]) == 6
    assert "slope_per_month" in body["forecast"]
    assert len(body["risk_distribution"]["matrix"]) == 25

    dept_perf = client.get("/api/dashboard/department-performance", headers=headers)
    assert dept_perf.status_code == 200
    assert len(dept_perf.json()) >= 8

    risk_dist = client.get("/api/dashboard/risk-distribution", headers=headers)
    assert risk_dist.status_code == 200
    assert risk_dist.json()["total_risks"] >= 5

    reports = client.get("/api/reports", headers=headers)
    assert reports.status_code == 200
    assert len(reports.json()) == 6

    rep_detail = client.get("/api/reports/rep-risk", headers=headers)
    assert rep_detail.status_code == 200
    assert len(rep_detail.json()["csv_rows"]) >= 5

    ai_resp = client.post(
        "/api/reports/ai-synthesis",
        headers=headers,
        json={"prompt": "Summarize top priority findings and SLA risks"},
    )
    assert ai_resp.status_code == 200
    assert len(ai_resp.json()["citations"]) >= 1
    assert "Composite Compliance Readiness" in ai_resp.json()["answer"]

    search_resp = client.get("/api/search?q=AWS", headers=headers)
    assert search_resp.status_code == 200
    assert search_resp.json()["total"] >= 1

    hist_resp = client.get("/api/history", headers=headers)
    assert hist_resp.status_code == 200
    assert hist_resp.json()["total"] >= 4

    for domain in ("financial", "hr", "project", "customer"):
        dom_resp = client.get(f"/api/domains/{domain}/telemetry", headers=headers)
        assert dom_resp.status_code == 200


def test_multi_company_tenant_isolation(client: TestClient, db_session: Session) -> None:
    # Create a completely separate Company B tenant
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

    # Tenant A's audits and findings are completely invisible to Tenant B
    a_audits = client.get("/api/audits", headers=tenant_a_headers).json()["items"]
    assert len(a_audits) >= 5

    b_audits = client.get("/api/audits", headers=tenant_b_headers).json()["items"]
    assert len(b_audits) == 0

    cross_fetch = client.get(f"/api/audits/{a_audits[0]['id']}", headers=tenant_b_headers)
    assert cross_fetch.status_code == 404

