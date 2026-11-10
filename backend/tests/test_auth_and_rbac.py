from fastapi.testclient import TestClient

from tests.conftest import TEST_USER_PASSWORD, login_as


def test_health_endpoint(client: TestClient) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"


def test_login_invalid_credentials(client: TestClient) -> None:
    resp = client.post(
        "/api/auth/login",
        json={"email": "eleanor.vance@companyaudit.io", "password": "WrongPassword123!"},
    )
    assert resp.status_code == 401


def test_jwt_session_refresh_and_logout_revocation(client: TestClient) -> None:
    # Use a fresh client so cookies are isolated from session client
    with TestClient(client.app) as session_client:
        login_resp = session_client.post(
            "/api/auth/login",
            json={"email": "marcus.chen@companyaudit.io", "password": TEST_USER_PASSWORD},
        )
        assert login_resp.status_code == 200
        access_token = login_resp.json()["access_token"]
        assert "companyaudit_refresh" in session_client.cookies

        me_resp = session_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["role"] == "Auditor"

        # Refresh access token via HttpOnly cookie
        refresh_resp = session_client.post("/api/auth/refresh")
        assert refresh_resp.status_code == 200
        refreshed_token = refresh_resp.json()["access_token"]

        # Logout increments token_version and clears cookie
        logout_resp = session_client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {refreshed_token}"},
        )
        assert logout_resp.status_code == 200

        # Previously issued access token must now be rejected (401)
        revoked_check = session_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {refreshed_token}"},
        )
        assert revoked_check.status_code == 401


def test_viewer_read_only_enforcement(client: TestClient) -> None:
    viewer_headers = login_as(client, "viewer@companyaudit.io")

    # Viewer CAN read executive views
    assert client.get("/api/dashboard", headers=viewer_headers).status_code == 200
    assert client.get("/api/audits", headers=viewer_headers).status_code == 200
    assert client.get("/api/findings", headers=viewer_headers).status_code == 200
    assert client.get("/api/risks", headers=viewer_headers).status_code == 200

    # Viewer CANNOT perform mutations (all 403)
    depts = client.get("/api/departments", headers=viewer_headers).json()
    dept_id = depts[0]["id"]
    audits = client.get("/api/audits", headers=viewer_headers).json()["items"]
    audit_id = audits[0]["id"]
    findings = client.get("/api/findings", headers=viewer_headers).json()["items"]
    finding_id = findings[0]["id"]
    risks = client.get("/api/risks", headers=viewer_headers).json()["items"]
    risk_id = risks[0]["id"]

    assert (
        client.post(
            "/api/audits",
            headers=viewer_headers,
            json={
                "title": "Unauthorized Audit",
                "domain": "Technology",
                "department_id": dept_id,
                "framework": "SOC 2",
            },
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"/api/findings/{finding_id}",
            headers=viewer_headers,
            json={"management_response": "Blocked"},
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"/api/risks/{risk_id}",
            headers=viewer_headers,
            json={"status": "Mitigated"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/departments",
            headers=viewer_headers,
            json={"code": "BLK-99", "name": "Blocked Dept"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/audits/{audit_id}/responses",
            headers=viewer_headers,
            json={"responses": []},
        ).status_code
        in {403, 422}
    )


def test_department_head_row_level_scoping(client: TestClient) -> None:
    # Marcus Kane is Department Head of ITS-04 (Technology & SecOps)
    kane_headers = login_as(client, "marcus.kane@companyaudit.io")
    findings = client.get("/api/findings", headers=kane_headers).json()["items"]

    its_finding = next(f for f in findings if f["department_code"] == "ITS-04")
    fin_finding = next(f for f in findings if f["department_code"] == "FIN-01")

    # Allowed: update management_response on own department finding
    ok_resp = client.put(
        f"/api/findings/{its_finding['id']}",
        headers=kane_headers,
        json={"management_response": "SecOps confirms Secrets Manager Lambda rollout this sprint."},
    )
    assert ok_resp.status_code == 200
    assert "Secrets Manager" in ok_resp.json()["management_response"]

    # Blocked (403): Department Head cannot close/sign off their own finding
    signoff_attempt = client.put(
        f"/api/findings/{its_finding['id']}",
        headers=kane_headers,
        json={"sign_off": True},
    )
    assert signoff_attempt.status_code == 403

    # Blocked (403): Department Head cannot respond to another department's finding
    cross_dept = client.put(
        f"/api/findings/{fin_finding['id']}",
        headers=kane_headers,
        json={"management_response": "Trying to edit Finance finding"},
    )
    assert cross_dept.status_code == 403


def test_admin_user_provisioning_and_auditor_restriction(client: TestClient) -> None:
    auditor_headers = login_as(client, "marcus.chen@companyaudit.io")
    admin_headers = login_as(client, "eleanor.vance@companyaudit.io")

    new_user_payload = {
        "email": "new.auditor@companyaudit.io",
        "password": "StrongTempPassword!2025",
        "full_name": "Jordan Blake",
        "job_title": "IT Audit Associate",
        "role": "Auditor",
    }

    # Auditor cannot provision users
    assert (
        client.post("/api/auth/register", headers=auditor_headers, json=new_user_payload).status_code == 403
    )

    # Admin can provision users
    created = client.post("/api/auth/register", headers=admin_headers, json=new_user_payload)
    assert created.status_code == 201
    assert created.json()["email"] == "new.auditor@companyaudit.io"

    # Case-insensitive duplicate email returns 409 Conflict
    dup = client.post(
        "/api/auth/register",
        headers=admin_headers,
        json={**new_user_payload, "email": "NEW.AUDITOR@companyaudit.io"},
    )
    assert dup.status_code == 409

