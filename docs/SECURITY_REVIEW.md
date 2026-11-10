# CompanyAudit — Security Architecture & Controls Review

**Document Version:** 2.0 (Phase 4 Enterprise Readiness)  
**Scope:** Full-Stack Web Application (`React 19 + FastAPI + PostgreSQL 16 + Nginx`)  
**Last Verified Against Codebase:** Phase 4 completion branch (`C:\Users\GANESH VALLABH M\.gemini\antigravity\scratch\companyaudit-platform`)

---

## 1. Authentication & Session Lifecycle Security

### 1.1 Credential Storage (`backend/app/core/security.py`)
- **Password Hashing:** OWASP Password Storage Cheat Sheet minimum **Argon2id** posture via `pwdlib.PasswordHash` / `Argon2Hasher`:
  - `time_cost = 3`
  - `memory_cost = 65536` (64 MiB)
  - `parallelism = 4`
- Verification (`verify_password`) rejects empty hashes deterministically before comparison.
- Admin password resets (`POST /api/auth/users/{user_id}/reset-password`) immediately re-hash the credential, increment `user.token_version`, revoke all active `refresh_sessions` rows for that user in PostgreSQL, and append a `User` history event.

### 1.2 Short-Lived Access JWTs & DB-Backed Refresh Session Rotation (`backend/app/api/routes/auth.py`, `backend/app/core/deps.py`)
- **Access Tokens:** Signed HS256 JWTs (`access_token_expire_minutes = 30` default) carrying `sub` (user UUID), `cid` (company UUID), `role`, `ver` (`user.token_version`), `type = "access"`, `jti`, `iat`, `exp`.
  - Stored strictly in React in-memory auth state (`src/context/AuthContext.tsx` / `src/services/apiClient.ts`) — **never persisted to `localStorage` or `sessionStorage`**, protecting against XSS token exfiltration across sessions.
  - Every protected API call validates `user.is_active`, `user.company_id == cid`, and `user.token_version == ver` in `get_current_user` (`backend/app/core/deps.py`), guaranteeing immediate invalidation on deactivation, password reset, or logout.
- **Refresh Tokens (`companyaudit_refresh` cookie):**
  - Signed HS256 JWTs (`refresh_token_expire_days = 7` default) with `type = "refresh"`, `jti` (session UUID), and `fam` (token family UUID).
  - Transmitted via **`HttpOnly`**, `SameSite=lax`, `Path=/`, `Secure=settings.cookie_secure` cookie.
  - **PostgreSQL Persistence (`refresh_sessions` table):** Stores SHA-256 hex digest (`hash_token`), `token_family`, `expires_at`, `revoked_at`, `replaced_by_id`, client `ip_address`, and truncated `user_agent` (`<= 255` chars). Raw refresh tokens are never stored in the database.
- **Rotation & Reuse (Theft) Detection (`POST /api/auth/refresh`):**
  - Each successful refresh mints a new session (`new_sess`), atomically marks the presented session `revoked_at = now` with `replaced_by_id = new_sess.id`, and rotates both cookies.
  - Presenting a refresh token whose `RefreshSession` row already has `revoked_at IS NOT NULL` triggers **token-family breach response**:
    1. Revokes all active sessions sharing `token_family`.
    2. Increments `user.token_version` (invalidating all active access tokens).
    3. Records a forensic security event (`Detected refresh token reuse; revoked full session family`) in `audit_history`.
    4. Clears auth cookies and returns `HTTP 401`.

### 1.3 CSRF & Origin Protection on Cookie-Based Endpoints
- `POST /api/auth/login` and `POST /api/auth/refresh` issue a cryptographically random readable cookie `companyaudit_csrf` (`secrets.token_urlsafe(32)`, `HttpOnly=false`, `SameSite=lax`, `Secure=settings.cookie_secure`).
- `src/services/apiClient.ts` reads `companyaudit_csrf` via `document.cookie` and injects it in the `X-CSRF-Token` request header for `/auth/refresh` and `/auth/logout` (`credentials: 'include'`).
- On cold unauthenticated loads (no `companyaudit_csrf` cookie present), `AuthContext.tsx` skips the mount `/auth/refresh` call so anonymous `/login` sessions incur zero spurious `403` responses while F5 reloads with an active cookie still silently restore sessions.
- Server-side `_validate_origin_and_csrf()` (`backend/app/api/routes/auth.py`):
  - Verifies `Origin` (or fallback `Referer` scheme+host) against `CORS_ORIGINS`; untrusted origins receive `HTTP 403`.
  - Uses constant-time `secrets.compare_digest(csrf_cookie, csrf_header)` on `/auth/refresh` and `/auth/logout` (whenever CSRF cookie is present); mismatches receive `HTTP 403`.

---

## 2. Authorization, Multi-Tenant Isolation & RBAC

### 2.1 Five-Role RBAC Matrix (`backend/app/core/deps.py`)
Enforced server-side via `Depends(require_roles(...))` and fine-grained field checks (UI disabled states act strictly as usability affordances, never security boundaries):

| Role | Scope & Permitted Operations | Explicit Restrictions |
| :--- | :--- | :--- |
| **Admin** | Full tenant configuration (`PUT /api/company`, `sha_lock_enabled`), user provisioning/editing/password resets, department CRUD, full audit/checklist/finding/risk/evidence/report distribution CRUD, SLA sweep, tenant-wide AI synthesis | Tenant-isolated (`company_id`); cannot bypass SHA-256 link locks while `sha_lock_enabled=true` on Verified evidence or delete closed findings/verified actions |
| **Auditor** | Create/update audits & scopes, create/update checklists & items, submit control tests, raise/update/delete non-closed findings, issue recommendations, create/verify/delete non-verified actions, create/update/escalate risks, upload/verify/flag/re-link evidence, trigger SLA sweeps, manage distributions, tenant-wide AI synthesis | Cannot mutate organization charter, departments, or user accounts (`403`) |
| **Management** | Update organization profile & governance targets (`PUT /api/company`), approve `Verification Pending` sign-offs (`sign_off`), reject/reopen findings with required `rejection_reason`, respond to recommendations, update risk `status`/`escalation_target`/`next_review_date` & escalate risks, manage report distributions, tenant-wide AI synthesis | Cannot create/mutate audits, checklists, or delete records; cannot alter finding severity/root cause (`403`) |
| **Department Head** | Respond to findings (`management_response`) and submit department findings to `Verification Pending`, respond to recommendations, create/update/submit corrective actions within own department, upload/re-link evidence linked to own department, **department-scoped AI synthesis** (`current_user.department_id`) | Blocked by `ensure_department_scope(user, target_department_id)` (`403`) on cross-department mutations; cannot verify/reject CAPA (`403`) or query other departments in AI Assistant (`scoped_department` locked) |
| **Viewer** | Read-only access across authorized tenant views, reports, exports, audit history verification, and search | Blocked (`403`) from all state-changing routes |

### 2.2 Multi-Tenant Row Isolation
- Every domain table carries a mandatory `company_id` foreign key.
- Route queries and foreign-key cross-references (`audit_id`, `department_id`, `finding_id`, `risk_id`, `user_id`, `checklist_item_id`) explicitly assert `record.company_id == current_user.company_id`, returning `HTTP 404` on cross-tenant UUIDs to prevent tenant enumeration.

---

## 3. Input Validation, Rate Limiting & DoS Safeguards

### 3.1 Sliding-Window Rate Limiting (`backend/app/core/rate_limit.py`)
Thread-safe per-key sliding-window limiter returning `HTTP 429` with `Retry-After` header (enabled when `RATE_LIMIT_ENABLED=true`):

| Route / Operation | Bucket Key Scope | Limit | Window | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/auth/login` | `auth_login_ip:<ip>` | 40 requests | 60s | Protects against credential stuffing |
| Failed logins | `auth_login_fail:<ip>:<email>` | 8 failures | 60s | Cleared immediately via `rate_limiter.reset()` on valid login |
| `POST /api/auth/refresh` | `auth_refresh:<ip>` | 40 requests | 60s | Mitigates token-churn floods |
| `POST /api/evidence` | `evidence_upload:<ip>` | 25 uploads | 60s | Caps storage I/O abuse |
| `POST /api/reports/ai-synthesis` | `ai_synthesis:<ip>` | 15 queries | 60s | Protects analytics/external LLM quota |
| `POST /api/notifications/run-sla-sweep` | `sla_sweep:<ip>` | 10 runs | 60s | Prevents heavy DB sweep floods |

### 3.2 Request & Schema Validation
- Strict Pydantic v2 schemas enforce string bounds, numeric ranges (probability/impact `1..5`, pagination `limit` `1..200`), and `Literal` enum whitelists.
- All database access flows through parameterized SQLAlchemy 2.0 ORM/Core constructs (`select(...)`, bound params); zero raw SQL string interpolation exists.

---

## 4. Evidence Vault Security (`backend/app/services/evidence_storage.py`)

1. **Extension & Executable Blocking:**
   - **Permitted extensions:** `.pdf`, `.png`, `.jpg`, `.jpeg`, `.csv`, `.json`, `.log`, `.txt`, `.xlsx`, `.docx`.
   - **Explicitly blocked:** `.exe`, `.dll`, `.bat`, `.cmd`, `.ps1`, `.sh`, `.js`, `.html`, `.htm`, `.svg`, `.php` (`HTTP 415`).
2. **Content-Type & Magic Byte Verification:**
   - Cross-checks declared MIME type against extension allow-list.
   - Reads content bytes and verifies binary magic signatures (`%PDF-`, PNG header `\x89PNG\r\n\x1a\n`, JPEG `\xff\xd8\xff`, OOXML ZIP `PK\x03\x04`) and rejects NUL bytes or non-UTF-8 payloads for text formats (`.csv`, `.json`, `.log`, `.txt`).
3. **Size Limit & Path Traversal Defense:**
   - Enforces `MAX_EVIDENCE_BYTES` (default 25 MiB = `26,214,400` bytes; `HTTP 413` on overflow) matched by Nginx `client_max_body_size 28M`.
   - Filenames are sanitized (`sanitize_filename`), stored outside the Nginx web root under `<EVIDENCE_STORAGE_DIR>/<company_id>/<uuid4><ext>`, and verified via `root_resolved in target_path.parents` on both write and download.
4. **End-to-End SHA-256 Integrity & Download Safety:**
   - Computes SHA-256 digest on upload; re-computes SHA-256 from disk on download (`GET /api/evidence/{id}/download`) and verification (`PUT /api/evidence/{id}/verify`). Checksum mismatches return `HTTP 409` and automatically flag corrupted files (`Flagged`).
   - Downloads set `X-Content-Type-Options: nosniff` and `X-Evidence-SHA256`.
   - **Enterprise SHA Lock (`Company.sha_lock_enabled`):** While enabled, modifying linkage foreign keys (`audit_id`, `finding_id`, `corrective_action_id`, `checklist_item_id`) on `Verified` evidence is rejected with `HTTP 400`.

---

## 5. Tamper-Evident Audit Trail & Cryptographic Chaining (`backend/app/services/audit_history.py`)

- Every significant authentication, mutation, sign-off, risk escalation, evidence operation, and AI query appends an immutable `AuditHistory` event.
- Canonical JSON serialization (`json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))`) computes `event_sha256` including `prev_event_sha256` (enforced distinct at DB level via `ck_audit_history_prev_sha256`).
- `GET /api/history/verify` walks from the unique tenant genesis block (`prev_event_sha256 IS NULL`) across all events, verifying payload hash recomputation and unbroken linear linkage (`genesis_ok`, `checked_events == total_events`, `broken_event_ids == []`).

---

## 6. HTTP Security Headers, Production Guardrails & Logging

- **FastAPI Security Middleware (`backend/app/main.py`):** Attaches `X-Request-ID`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()` on every response; disables `/api/docs` outside `development`/`test`.
- **Nginx Reverse Proxy Headers (`nginx.conf`):** Sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.
- **Structured Logging & Redaction (`backend/app/core/logging_config.py`):** Outputs single-line JSON logs with `request_id` correlation and regex redaction replacing Bearer tokens, `password=...`, and `api_key=...` with `[REDACTED]`. Unhandled exceptions return sanitized HTTP `500` payloads containing only an opaque `error_ref` correlation ID (`uuid4()[:12]`).
- **Fail-Closed Startup Validation (`backend/app/core/config.py`):** When `ENVIRONMENT` is `production` or `staging`, Pydantic `@model_validator` refuses to boot if `ALLOW_DEMO_SEED=true`, `COOKIE_SECURE=false`, `JWT_SECRET_KEY` is shorter than 32 chars or still uses a `replace_with` placeholder, or `CORS_ORIGINS` is empty / contains `*`.
- **Container Hardening:** `backend/Dockerfile` creates and runs as unprivileged system user `appuser`.

---

## 7. Residual Operational Considerations (Non-Blocking for Controlled Environments)

1. **Multi-Worker Rate Limiting:** `SlidingWindowRateLimiter` uses an in-process thread-safe dictionary (`uvicorn` single-worker compatible). Scaling horizontally across multiple API replicas or Gunicorn/Uvicorn workers requires replacing the backend store with Redis (e.g., sorted-set/Lua sliding window).
2. **TLS Termination Requirement:** `docker-compose.prod.yml` exposes `nginx` on container port `80` (`COOKIE_SECURE=true` default). Production deployment over public/corporate networks **must** sit behind a TLS-terminating reverse proxy/load balancer serving HTTPS and forwarding `X-Forwarded-Proto: https`; otherwise browsers will refuse to store `Secure` cookies over plain HTTP.
3. **External LLM Data Egress Governance:** External AI synthesis is opt-in and disabled by default (`AI_PROVIDER` unset -> offline deterministic SQL analytics mode). Before setting `AI_API_KEY`, security teams should verify vendor DPA coverage because aggregate audit summary telemetry is transmitted server-side during synthesis calls.
4. **Evidence Malware Scanning:** Magic-byte validation, extension whitelisting, and UUID out-of-webroot storage are active; integrating an async AV scanner (e.g., ClamAV daemon) is recommended prior to exposing uploads to external third-party auditors.

