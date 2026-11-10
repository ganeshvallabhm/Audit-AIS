# CompanyAudit Enterprise Platform — REST API Reference

**Base Prefix:** `/api` (reverse-proxied via Nginx `/api/` -> `http://backend:8000/api/` in container deployments)  
**Interactive OpenAPI Docs:** `/api/docs` (enabled only in `development` and `test` environments; disabled in `staging`/`production`)  
**Content Type:** `application/json` unless otherwise noted (`multipart/form-data` for evidence upload; binary/CSV attachments for exports)

---

## 1. Authentication, Cookies & Request Headers

1. **Bearer JWT Authentication:**
   - Protected routes require `Authorization: Bearer <access_token>` (short-lived HS256 JWT; 30 minutes default).
   - Access tokens carry `sub` (user ID), `cid` (company ID), `role`, and `ver` (`token_version`).
2. **Refresh & CSRF Double-Submit Cookies:**
   - `POST /api/auth/login` and `POST /api/auth/refresh` set:
     - `companyaudit_refresh` (`HttpOnly`, `SameSite=lax`, `Path=/`, `Secure` controlled by `COOKIE_SECURE`)
     - `companyaudit_csrf` (`HttpOnly=false`, `SameSite=lax`, `Path=/`, `Secure` controlled by `COOKIE_SECURE`)
   - Cookie-dependent requests (`POST /api/auth/refresh`, and `POST /api/auth/logout` when CSRF cookie is present) **must** include:
     - Matching `X-CSRF-Token: <companyaudit_csrf cookie value>` header
     - Trusted `Origin` or `Referer` matching `CORS_ORIGINS`
3. **Standard Headers Returned:**
   - `X-Request-ID`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
4. **Standard Error Format:**
   - Validation / client errors: HTTP `400`, `401`, `403`, `404`, `409`, `413`, `415`, `422` with `{"detail": "..."}`.
   - Rate limit exceeded: HTTP `429` with `Retry-After` header.
   - Unexpected server error: HTTP `500` with sanitized `{"detail": "Internal server error. Reference ID: <ref>", "error_ref": "<ref>"}`.

---

## 2. Role Access Legend

- **All Authenticated:** `Admin`, `Auditor`, `Department Head`, `Management`, `Viewer`
- **Admin Only:** `Admin`
- **Audit Team:** `Admin`, `Auditor`
- **Exec / Admin:** `Admin`, `Management`
- **Governance Write:** `Admin`, `Auditor`, `Department Head`, `Management` (with role-field restrictions enforced server-side)

---

## 3. Endpoint Reference

### 3.1 System Health

| Method | Path | Auth | Rate Limit | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | None | Executes `SELECT 1` against PostgreSQL and returns `{"status": "ok", "database": "connected", "environment": "..."}` |

---

### 3.2 Authentication & User Directory (`/api/auth`)

| Method | Path | Auth / RBAC | Rate Limit | Request / Query | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | `40/60s` per IP; `8/60s` failed per IP+email | `LoginRequest` (`email`, `password`) | `TokenResponse` + sets refresh & CSRF cookies |
| `POST` | `/api/auth/register` | Admin Only | None | `RegisterUserRequest` (`email`, `password >= 10`, `full_name`, `job_title?`, `role`, `department_id?`, `certifications?`) | `201 Created` `UserSummary` |
| `GET` | `/api/auth/me` | All Authenticated | None | — | `UserSummary` |
| `POST` | `/api/auth/refresh` | Cookie + `X-CSRF-Token` | `40/60s` per IP | `companyaudit_refresh` + `companyaudit_csrf` cookies & `X-CSRF-Token` header | `TokenResponse` + rotated cookies; `401` revoking family if reuse detected |
| `POST` | `/api/auth/logout` | All Authenticated + `X-CSRF-Token` | None | `X-CSRF-Token` header (when CSRF cookie present) | `MessageResponse`; revokes all user `refresh_sessions` & increments `token_version` |
| `GET` | `/api/auth/users` | All Authenticated | None | — | `list[UserSummary]` (tenant-scoped) |
| `PUT` | `/api/auth/users/{user_id}` | Admin Only | None | `UserUpdateRequest` (`full_name?`, `job_title?`, `role?`, `department_id?`, `is_active?`, `certifications?`) | `UserSummary`; deactivating increments `token_version` and revokes active sessions |
| `POST` | `/api/auth/users/{user_id}/reset-password` | Admin Only | None | `AdminResetPasswordRequest` (`new_password >= 10`) | `MessageResponse`; re-hashes password, increments `token_version`, revokes active sessions |

---

### 3.3 Company Profile & Departments (`/api`)

| Method | Path | Auth / RBAC | Request / Query | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/company` | All Authenticated | — | `CompanyProfileOut` (includes `sha_lock_enabled`, SLA flags, score targets) |
| `PUT` | `/api/company` | Exec / Admin | `CompanyProfileUpdate` (partial updates on charter metadata, `regulatory_scope`, thresholds, toggles) | `CompanyProfileOut` |
| `GET` | `/api/departments` | All Authenticated | — | `list[DepartmentOut]` (includes Pandas-aggregated live `score`, `active_audits`, `open_findings`, `risk_count`) |
| `POST` | `/api/departments` | Admin Only | `DepartmentCreate` (`code`, `name`, `head_user_id?`, `target_score`, `scoring_weight`, `attention_note?`) | `201 Created` `DepartmentOut` (`409` on duplicate code) |
| `PUT` | `/api/departments/{department_id}` | Admin Only | `DepartmentUpdate` (`name?`, `head_user_id?`, `target_score?`, `scoring_weight?`, `attention_note?`) | `DepartmentOut` |
| `DELETE` | `/api/departments/{department_id}` | Admin Only | — | `MessageResponse` (`409` if referenced by audits, findings, risks, users, projects, employees, or financial metrics) |

---

### 3.4 Audits, Scopes, Checklists & Control Responses (`/api`)

| Method | Path | Auth / RBAC | Request / Query | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/audits` | All Authenticated | Query: `domain?`, `status?`, `department_id?`, `search?`, `limit` (`1..200`, def 50), `offset` | `PaginatedResponse[AuditOut]` |
| `POST` | `/api/audits` | Audit Team | `AuditCreate` (`code?`, `title`, `domain`, `department_id`, `lead_auditor_id?`, `framework`, `status`, `scheduled_start?`, `target_due_date?`, `summary?`, `scopes[]`) | `201 Created` `AuditOut` (dispatches assignment notification) |
| `GET` | `/api/audits/{audit_id}` | All Authenticated | — | `AuditOut` |
| `PUT` | `/api/audits/{audit_id}` | Audit Team | `AuditUpdate` (partial updates; `status` validated against `ALLOWED_AUDIT_TRANSITIONS`) | `AuditOut` |
| `POST` | `/api/audits/{audit_id}/scopes` | Audit Team | `AuditScopeCreate` (`scope_name`, `system_or_process`, `regulatory_clause?`, `in_scope`) | `201 Created` `AuditScopeOut` (`400` if audit is `Closed`) |
| `PUT` | `/api/audits/{audit_id}/scopes/{scope_id}` | Audit Team | `AuditScopeUpdate` | `AuditScopeOut` (`400` if audit is `Closed`) |
| `DELETE` | `/api/audits/{audit_id}/scopes/{scope_id}` | Audit Team | — | `MessageResponse` (`400` if audit is `Closed`) |
| `GET` | `/api/checklists` | All Authenticated | Query: `domain?`, `audit_id?` | `list[ChecklistOut]` (with nested weighted `ChecklistItemOut` & latest test results) |
| `POST` | `/api/checklists` | Audit Team | `ChecklistCreate` (`code?`, `title`, `domain`, `framework`, `version`) | `201 Created` `ChecklistOut` |
| `POST` | `/api/checklists/{checklist_id}/items` | Audit Team | `ChecklistItemCreate` (`control_code`, `title`, `test_procedure`, `weight`, `display_order`) | `201 Created` `ChecklistItemOut` |
| `PUT` | `/api/checklist-items/{item_id}` | Audit Team | `ChecklistItemUpdate` (`title?`, `test_procedure?`, `weight?`, `display_order?`) | `ChecklistItemOut` |
| `GET` | `/api/audits/{audit_id}/responses` | All Authenticated | — | `list[AuditResponseOut]` |
| `POST` | `/api/audits/{audit_id}/responses` | Audit Team | `SubmitAuditResponsesRequest` (`responses[]`: `{checklist_item_id, response_value, auditor_notes?}`) | `SubmitAuditResponsesResult` (recalculates weighted `computed_score`; `400` if `Closed`) |

---

### 3.5 Findings, Recommendations, Corrective Actions & Risks (`/api`)

| Method | Path | Auth / RBAC | Request / Query | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/findings` | All Authenticated | Query: `severity?`, `status?`, `department_id?`, `audit_id?`, `search?`, `limit`, `offset` | `PaginatedResponse[FindingOut]` |
| `POST` | `/api/findings` | Audit Team | `FindingCreate` (`code?`, `audit_id`, `audit_response_id?`, `department_id`, `owner_user_id?`, `lead_auditor_id?`, `title`, `root_cause`, `workstream?`, `severity`, `status`, `target_sla_date`, `management_response?`) | `201 Created` `FindingOut` |
| `PUT` | `/api/findings/{finding_id}` | Governance Write | `FindingUpdate` (`Department Head`: own dept `management_response` / `Verification Pending` only; `Management`: `management_response` / `sign_off` / rejection -> `In Progress` with `rejection_reason >= 3` chars) | `FindingOut` |
| `DELETE` | `/api/findings/{finding_id}` | Audit Team | — | `MessageResponse` (`400` if status is `Closed`) |
| `POST` | `/api/recommendations` | Audit Team | `RecommendationCreate` (`finding_id`, `risk_id?`, `title`, `guidance`, `priority`) | `201 Created` `RecommendationOut` |
| `POST` | `/api/recommendations/{recommendation_id}/respond` | Admin / Dept Head / Management | `RecommendationRespondRequest` (`management_response`, `accepted_by_management`) | `RecommendationOut` (Dept Head scoped to finding's department) |
| `GET` | `/api/actions` | All Authenticated | Query: `finding_id?`, `risk_id?`, `status?`, `limit`, `offset` | `PaginatedResponse[CorrectiveActionOut]` |
| `POST` | `/api/actions` | Admin / Auditor / Dept Head | `CorrectiveActionCreate` (requires `finding_id` or `risk_id`; Dept Head department-scoped) | `201 Created` `CorrectiveActionOut` |
| `PUT` | `/api/actions/{action_id}` | Admin / Auditor / Dept Head | `CorrectiveActionUpdate` (Dept Head cannot set `Verified` or `Rejected`) | `CorrectiveActionOut` |
| `DELETE` | `/api/actions/{action_id}` | Audit Team | — | `MessageResponse` (`400` if `Verified`) |
| `GET` | `/api/risks` | All Authenticated | Query: `category?`, `severity?`, `status?`, `probability?`, `impact?`, `search?`, `limit`, `offset` | `PaginatedResponse[RiskOut]` |
| `POST` | `/api/risks` | Audit Team | `RiskCreate` (`probability`/`impact` `1..5`, optional residual ratings, `mapped_frameworks`, `affected_assets`) | `201 Created` `RiskOut` |
| `PUT` | `/api/risks/{risk_id}` | Admin / Auditor / Management | `RiskUpdate` (`Management` restricted to `status`, `escalation_target`, `next_review_date`) | `RiskOut` |
| `POST` | `/api/risks/{risk_id}/escalate` | Admin / Auditor / Management | `RiskEscalateRequest` (`escalation_target?`, `note?`) | `RiskOut` (transitions `Open` -> `In Review` and triggers Board alert) |

---

### 3.6 SHA-256 Evidence Vault (`/api/evidence`)

| Method | Path | Auth / RBAC | Rate Limit | Request / Query | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/evidence` | All Authenticated | None | Query: `audit_id?`, `finding_id?`, `status?`, `search?`, `limit`, `offset` | `PaginatedResponse[EvidenceOut]` |
| `POST` | `/api/evidence` | Admin / Auditor / Dept Head | `25/60s` | `multipart/form-data`: `file` (`.pdf/.png/.jpg/.jpeg/.csv/.json/.log/.txt/.xlsx/.docx`, `<= 25 MiB`), `audit_id?`, `finding_id?`, `corrective_action_id?`, `checklist_item_id?`, `tag?` | `201 Created` `EvidenceOut` (`415` on blocked/spoofed magic bytes; `413` over 25 MiB) |
| `GET` | `/api/evidence/{evidence_id}/download` | All Authenticated | None | — | Binary `FileResponse` + `X-Evidence-SHA256`; `409` if disk SHA-256 fails verification |
| `PUT` | `/api/evidence/{evidence_id}/verify` | Audit Team | None | `EvidenceVerifyRequest` (`verification_status`: `Pending Review`\|`Verified`\|`Flagged`, `verify_file_checksum`) | `EvidenceOut` (`409` if checksum mismatch detected) |
| `PUT` | `/api/evidence/{evidence_id}` | Admin / Auditor / Dept Head | None | `EvidenceUpdate` (`audit_id?`, `finding_id?`, `corrective_action_id?`, `checklist_item_id?`, `tag?`) | `EvidenceOut` (`400` if `Verified` and `Company.sha_lock_enabled=true` and modifying links) |
| `GET` | `/api/evidence/{evidence_id}/history` | All Authenticated | None | — | `list[AuditHistoryOut]` (chain-of-custody entries for this artifact) |

---

### 3.7 Dashboard, Analytics, Reports, AI Synthesis, Notifications, Ledger & Search (`/api`)

| Method | Path | Auth / RBAC | Rate Limit | Request / Query | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard` | All Authenticated | None | Query: `period`, `date_from?`, `date_to?`, `department_id?`, `domain?`, `audit_status?`, `risk_severity?` | `DashboardOverviewOut` (live KPIs, Pandas depts, trend/forecast with `<3` month gate, framework & evidence breakdowns, methodology) |
| `GET` | `/api/dashboard/department-performance` | All Authenticated | None | — | `list[DepartmentOut]` |
| `GET` | `/api/dashboard/risk-distribution` | All Authenticated | None | — | `RiskDistributionOut` (counts + 25 cells for 5x5 matrix) |
| `GET` | `/api/search` | All Authenticated | None | Query: `q` (`1..120` chars) | `GlobalSearchResponse` (cross-entity Audits, Findings, Risks, Evidence, Controls) |
| `GET` | `/api/reports` | All Authenticated | None | — | `list[ReportSuiteOut]` (6 governance suites) |
| `GET` | `/api/reports/{report_id}` | All Authenticated | None | Query: `period` (e.g. `Q4 2025`, `30d`, `90d`, `YTD`) | `ReportDetailOut` |
| `GET` | `/api/reports/{report_id}/export` | All Authenticated | None | Query: `format` (`csv`\|`xlsx`\|`pdf`), `period` | Attachment download (`text/csv`, `.xlsx` OpenPyXL workbook, or `.pdf` FPDF2 document) |
| `GET` | `/api/reports/distributions` | All Authenticated | None | — | `list[DistributionRuleOut]` |
| `POST` | `/api/reports/distributions` | Admin / Auditor / Management | None | `DistributionRuleCreate` | `201 Created` `DistributionRuleOut` |
| `PUT` | `/api/reports/distributions/{rule_id}` | Admin / Auditor / Management | None | `DistributionRuleUpdate` | `DistributionRuleOut` |
| `DELETE` | `/api/reports/distributions/{rule_id}` | Admin / Auditor / Management | None | — | `MessageResponse` |
| `POST` | `/api/reports/ai-synthesis` | All Authenticated (Dept Head dept-scoped) | `15/60s` | `AiSynthesisRequest` (`prompt`, `domain?`) | `AiSynthesisResponse` (`verified_facts[]`, `recommendations[]`, `provider_status`, `scoped_department?`, `citations[]`, logged to `audit_history`) |
| `GET` | `/api/notifications` | All Authenticated | None | Query: `unread_only` (`bool`) | `list[NotificationOut]` (scoped to current user, max 50 recent) |
| `PUT` | `/api/notifications/{notification_id}/read` | All Authenticated | None | — | `NotificationOut` |
| `PUT` | `/api/notifications/read-all` | All Authenticated | None | — | `MessageResponse` |
| `POST` | `/api/notifications/run-sla-sweep` | Audit Team | `10/60s` | — | `SlaSweepResultOut` (deduplicated audit/action/risk/finding SLA alert scan) |
| `GET` | `/api/history` | All Authenticated | None | Query: `category?`, `module?`, `search?`, `limit`, `offset` | `PaginatedResponse[AuditHistoryOut]` |
| `GET` | `/api/history/verify` | All Authenticated | None | — | `AuditHistoryVerifyOut` (`valid`, `checked_events`, `total_events`, `genesis_ok`, `broken_event_ids`, `latest_event_sha256`, `verification_note`) |
| `GET` | `/api/domains/{domain}/telemetry` | All Authenticated | None | Path: `domain` (`financial`, `hr`, `project`, `technology`, `operations`, `customer`, `compliance`, `all`) | `DomainTelemetryOut` |

