from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.conftest import login_as


def test_weighted_checklist_scoring_formula(client: TestClient) -> None:
    admin_headers = login_as(client, "eleanor.vance@companyaudit.io")
    depts = client.get("/api/departments", headers=admin_headers).json()
    tech_dept = next(d for d in depts if d["code"] == "ITS-04")

    # Create a fresh Technology audit to test Pass/Partial/Fail/N/A scoring in isolation
    create_resp = client.post(
        "/api/audits",
        headers=admin_headers,
        json={
            "title": "Scoring Verification Audit",
            "domain": "Technology",
            "department_id": tech_dept["id"],
            "framework": "SOC 2 Type II",
            "status": "In Progress",
        },
    )
    assert create_resp.status_code == 201
    audit_id = create_resp.json()["id"]

    checklists = client.get("/api/checklists?domain=Technology", headers=admin_headers).json()
    items = checklists[0]["items"]
    assert len(items) == 3  # weights: 2.0, 1.5, 1.0

    # CC6.1-IAM (weight 2.0) -> Pass (1.0 * 2.0 = 2.0)
    # CC6.7-KMS (weight 1.5) -> Fail (0.0 * 1.5 = 0.0)
    # CC6.8-BAK (weight 1.0) -> N/A (Excluded from denominator!)
    # Expected: 2.0 / 2.0+1.5 = 2.0 / 3.5 = 57.14%
    item_by_code = {it["control_code"]: it for it in items}
    resp = client.post(
        f"/api/audits/{audit_id}/responses",
        headers=admin_headers,
        json={
            "responses": [
                {"checklist_item_id": item_by_code["CC6.1-IAM"]["id"], "response_value": "Pass"},
                {"checklist_item_id": item_by_code["CC6.7-KMS"]["id"], "response_value": "Fail"},
                {"checklist_item_id": item_by_code["CC6.8-BAK"]["id"], "response_value": "N/A"},
            ]
        },
    )
    assert resp.status_code == 200
    assert resp.json()["computed_score"] == 57.14

    # Change CC6.7-KMS to Partial (0.5 * 1.5 = 0.75) -> (2.0 + 0.75) / 3.5 = 78.57%
    resp2 = client.post(
        f"/api/audits/{audit_id}/responses",
        headers=admin_headers,
        json={
            "responses": [
                {"checklist_item_id": item_by_code["CC6.7-KMS"]["id"], "response_value": "Partial"},
            ]
        },
    )
    assert resp2.status_code == 200
    assert resp2.json()["computed_score"] == 78.57

    # All N/A -> computed_score is None
    resp_na = client.post(
        f"/api/audits/{audit_id}/responses",
        headers=admin_headers,
        json={
            "responses": [
                {"checklist_item_id": item_by_code["CC6.1-IAM"]["id"], "response_value": "N/A"},
                {"checklist_item_id": item_by_code["CC6.7-KMS"]["id"], "response_value": "N/A"},
                {"checklist_item_id": item_by_code["CC6.8-BAK"]["id"], "response_value": "N/A"},
            ]
        },
    )
    assert resp_na.status_code == 200
    assert resp_na.json()["computed_score"] is None


def test_risk_scoring_severity_boundaries_and_validation(client: TestClient) -> None:
    auditor_headers = login_as(client, "marcus.chen@companyaudit.io")
    depts = client.get("/api/departments", headers=auditor_headers).json()
    dept_id = depts[0]["id"]

    # Boundary validation (1..5 only)
    bad_prob = client.post(
        "/api/risks",
        headers=auditor_headers,
        json={
            "department_id": dept_id,
            "title": "Invalid Risk Probability",
            "scope_description": "Probability 6 must fail",
            "category": "Technology",
            "probability": 6,
            "impact": 3,
        },
    )
    assert bad_prob.status_code == 422

    # Exact severity boundaries: 4->Low, 5->Medium, 9->Medium, 10->High, 16->High, 20->Critical, 25->Critical
    cases = [
        (1, 4, 4, "Low"),
        (1, 5, 5, "Medium"),
        (3, 3, 9, "Medium"),
        (2, 5, 10, "High"),
        (4, 4, 16, "High"),
        (4, 5, 20, "Critical"),
        (5, 5, 25, "Critical"),
    ]
    for idx, (prob, imp, exp_score, exp_sev) in enumerate(cases):
        r = client.post(
            "/api/risks",
            headers=auditor_headers,
            json={
                "code": f"RSK-BND-{idx}",
                "department_id": dept_id,
                "title": f"Boundary Test Risk {prob}x{imp}",
                "scope_description": "Boundary classification verification",
                "category": "Technology",
                "probability": prob,
                "impact": imp,
            },
        )
        assert r.status_code == 201
        body = r.json()
        assert body["inherent_score"] == exp_score
        assert body["severity"] == exp_sev


def test_audit_7_state_lifecycle_and_open_finding_guard(client: TestClient) -> None:
    auditor_headers = login_as(client, "marcus.chen@companyaudit.io")
    admin_headers = login_as(client, "eleanor.vance@companyaudit.io")
    depts = client.get("/api/departments", headers=auditor_headers).json()
    ops_dept = next(d for d in depts if d["code"] == "OPS-05")

    created = client.post(
        "/api/audits",
        headers=auditor_headers,
        json={
            "title": "Lifecycle Transition Audit",
            "domain": "Operations",
            "department_id": ops_dept["id"],
            "framework": "ISO 22301",
            "status": "Draft",
        },
    )
    assert created.status_code == 201
    audit_id = created.json()["id"]

    # Invalid jump Draft -> Closed rejected (400)
    bad_jump = client.put(f"/api/audits/{audit_id}", headers=auditor_headers, json={"status": "Closed"})
    assert bad_jump.status_code == 400

    # Valid path Draft -> Scheduled -> In Progress -> Review
    assert client.put(f"/api/audits/{audit_id}", headers=auditor_headers, json={"status": "Scheduled"}).status_code == 200
    assert client.put(f"/api/audits/{audit_id}", headers=auditor_headers, json={"status": "In Progress"}).status_code == 200
    assert client.put(f"/api/audits/{audit_id}", headers=auditor_headers, json={"status": "Review"}).status_code == 200

    # Raise open finding on this audit
    finding_resp = client.post(
        "/api/findings",
        headers=auditor_headers,
        json={
            "audit_id": audit_id,
            "department_id": ops_dept["id"],
            "title": "Lifecycle Open Blocker Finding",
            "root_cause": "Missing backup generator fuel log",
            "severity": "High",
            "target_sla_date": str(date.today() + timedelta(days=7)),
        },
    )
    assert finding_resp.status_code == 201
    finding_id = finding_resp.json()["id"]

    # Review -> Verification blocked while open finding exists
    skip_blocked = client.put(
        f"/api/audits/{audit_id}",
        headers=auditor_headers,
        json={"status": "Verification"},
    )
    assert skip_blocked.status_code == 400

    # Must move to Action Required first
    assert (
        client.put(f"/api/audits/{audit_id}", headers=auditor_headers, json={"status": "Action Required"}).status_code
        == 200
    )

    # Move to Verification then try to Close while finding is still Open -> blocked
    assert client.put(f"/api/audits/{audit_id}", headers=auditor_headers, json={"status": "Verification"}).status_code == 200
    close_blocked = client.put(f"/api/audits/{audit_id}", headers=auditor_headers, json={"status": "Closed"})
    assert close_blocked.status_code == 400

    # Sign off finding, then Close succeeds and locks audit!
    assert (
        client.put(f"/api/findings/{finding_id}", headers=admin_headers, json={"sign_off": True}).status_code == 200
    )
    closed_ok = client.put(f"/api/audits/{audit_id}", headers=admin_headers, json={"status": "Closed"})
    assert closed_ok.status_code == 200
    assert closed_ok.json()["status"] == "Closed"
    assert closed_ok.json()["completed_at"] is not None

