from fastapi.testclient import TestClient

from app.core.rate_limit import rate_limiter
from tests.conftest import TEST_USER_PASSWORD, login_as


def test_health_endpoint(client: TestClient) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"


def test_login_invalid_credentials_and_rate_limit(client: TestClient) -> None:
    rate_limiter.reset()
    target_email = "ratelimit.probe@companyaudit.io"
    for _ in range(8):
        resp = client.post(
            "/api/auth/login",
            json={"email": target_email, "password": "WrongPassword123!"},
        )
        assert resp.status_code == 401

    throttled = client.post(
        "/api/auth/login",
        json={"email": target_email, "password": "WrongPassword123!"},
    )
    assert throttled.status_code == 429
    assert "retry-after" in throttled.headers
    rate_limiter.reset()


def test_jwt_session_refresh_csrf_and_reuse_detection(client: TestClient) -> None:
    with TestClient(client.app) as session_client:
        login_resp = session_client.post(
            "/api/auth/login",
            json={"email": "marcus.chen@companyaudit.io", "password": TEST_USER_PASSWORD},
        )
        assert login_resp.status_code == 200
        access_token = login_resp.json()["access_token"]
        assert "companyaudit_refresh" in session_client.cookies
        assert "companyaudit_csrf" in session_client.cookies
        old_refresh = session_client.cookies.get("companyaudit_refresh")
        csrf_token = session_client.cookies.get("companyaudit_csrf")

        me_resp = session_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["role"] == "Auditor"

        # Refresh WITHOUT X-CSRF-Token header must fail (403)
        csrf_fail = session_client.post("/api/auth/refresh")
        assert csrf_fail.status_code == 403

        # Refresh WITH matching X-CSRF-Token header rotates token cleanly
        refresh_resp = session_client.post(
            "/api/auth/refresh",
            headers={"X-CSRF-Token": csrf_token or ""},
        )
        assert refresh_resp.status_code == 200
        refreshed_token = refresh_resp.json()["access_token"]
        new_csrf = session_client.cookies.get("companyaudit_csrf") or ""

        # Replaying old rotated refresh token triggers token-family reuse detection (401 + session revocation)
        with TestClient(client.app) as replay_client:
            replay_client.cookies.set("companyaudit_refresh", old_refresh or "")
            replay_client.cookies.set("companyaudit_csrf", new_csrf)
            reuse_resp = replay_client.post(
                "/api/auth/refresh",
                headers={"X-CSRF-Token": new_csrf},
            )
            assert reuse_resp.status_code == 401
            assert "reuse" in reuse_resp.json()["detail"].lower()

        # Previously issued access token was revoked by reuse defense
        revoked_after_reuse = session_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {refreshed_token}"},
        )
        assert revoked_after_reuse.status_code == 401

    # Fresh login & normal logout revocation flow
    with TestClient(client.app) as logout_client:
        login2 = logout_client.post(
            "/api/auth/login",
            json={"email": "marcus.chen@companyaudit.io", "password": TEST_USER_PASSWORD},
        )
        assert login2.status_code == 200
        tok2 = login2.json()["access_token"]
        csrf2 = logout_client.cookies.get("companyaudit_csrf") or ""
        logout_resp = logout_client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {tok2}", "X-CSRF-Token": csrf2},
        )
        assert logout_resp.status_code == 200
        assert (
            logout_client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok2}"}).status_code
            == 401
        )


def test_viewer_read_only_enforcement(client: TestClient) -> None:
    viewer_headers = login_as(client, "viewer@companyaudit.io")

    assert client.get("/api/dashboard", headers=viewer_headers).status_code == 200
    assert client.get("/api/audits", headers=viewer_headers).status_code == 200
    assert client.get("/api/findings", headers=viewer_headers).status_code == 200
    assert client.get("/api/risks", headers=viewer_headers).status_code == 200

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


def test_department_head_row_level_and_ai_scoping(client: TestClient) -> None:
    kane_headers = login_as(client, "marcus.kane@companyaudit.io")
    findings = client.get("/api/findings", headers=kane_headers).json()["items"]

    its_finding = next(f for f in findings if f["department_code"] == "ITS-04")
    fin_finding = next(f for f in findings if f["department_code"] == "FIN-01")

    ok_resp = client.put(
        f"/api/findings/{its_finding['id']}",
        headers=kane_headers,
        json={"management_response": "SecOps confirms Secrets Manager Lambda rollout this sprint."},
    )
    assert ok_resp.status_code == 200
    assert "Secrets Manager" in ok_resp.json()["management_response"]

    signoff_attempt = client.put(
        f"/api/findings/{its_finding['id']}",
        headers=kane_headers,
        json={"sign_off": True},
    )
    assert signoff_attempt.status_code == 403

    cross_dept = client.put(
        f"/api/findings/{fin_finding['id']}",
        headers=kane_headers,
        json={"management_response": "Trying to edit Finance finding"},
    )
    assert cross_dept.status_code == 403

    # AI Assistant enforces strict Department Head isolation (must NOT cite Finance FIN-01 findings)
    ai_scoped = client.post(
        "/api/reports/ai-synthesis",
        headers=kane_headers,
        json={"prompt": "Show top findings and SLA posture across the business"},
    )
    assert ai_scoped.status_code == 200
    ai_body = ai_scoped.json()
    assert ai_body["scoped_department"] is not None
    assert "ITS-04" in ai_body["scoped_department"]
    cited_refs = [c["entity_ref"] for c in ai_body["citations"]]
    assert fin_finding["code"] not in cited_refs


def test_admin_user_provisioning_and_password_reset(client: TestClient) -> None:
    auditor_headers = login_as(client, "marcus.chen@companyaudit.io")
    admin_headers = login_as(client, "eleanor.vance@companyaudit.io")

    new_user_payload = {
        "email": "new.auditor@companyaudit.io",
        "password": "StrongTempPassword!2025",
        "full_name": "Jordan Blake",
        "job_title": "IT Audit Associate",
        "role": "Auditor",
    }

    assert (
        client.post("/api/auth/register", headers=auditor_headers, json=new_user_payload).status_code == 403
    )

    created = client.post("/api/auth/register", headers=admin_headers, json=new_user_payload)
    assert created.status_code == 201
    user_id = created.json()["id"]
    assert created.json()["email"] == "new.auditor@companyaudit.io"

    dup = client.post(
        "/api/auth/register",
        headers=admin_headers,
        json={**new_user_payload, "email": "NEW.AUDITOR@companyaudit.io"},
    )
    assert dup.status_code == 409

    # Login as new user, then Admin resets password -> old token invalidated, new password works
    user_headers = login_as(client, "new.auditor@companyaudit.io", "StrongTempPassword!2025")
    reset_resp = client.post(
        f"/api/auth/users/{user_id}/reset-password",
        headers=admin_headers,
        json={"new_password": "RotatedEnterprisePassword#99"},
    )
    assert reset_resp.status_code == 200
    assert client.get("/api/auth/me", headers=user_headers).status_code == 401
    new_headers = login_as(client, "new.auditor@companyaudit.io", "RotatedEnterprisePassword#99")
    assert client.get("/api/auth/me", headers=new_headers).status_code == 200
