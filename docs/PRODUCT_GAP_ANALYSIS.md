# CompanyAudit — Phase 4 Product Gap Analysis & Module Inventory

**Document Version:** 1.0  
**Target Codebase:** `C:\Users\GANESH VALLABH M\.gemini\antigravity\scratch\companyaudit-platform`  
**Audit Baseline Commit:** `chore: baseline pre-phase-4 checkpoint`

---

## 1. System Architecture Inventory

### 1.1 Registered Frontend Routes (`src/App.tsx`) vs. Page Components (`src/pages/`)
The frontend registers **20 exact routes** (including `/login`, root redirect `/`, and **19 application workspace routes**, plus fallback wildcard `*`) across **14 page components**:

| Route Path | Page Component | Functional Scope | Notes / Shared Parameterization |
| :--- | :--- | :--- | :--- |
| `/login` | `LoginPage.tsx` | Auth / Demo entry | Cookie+JWT login + explicit Demo Mode |
| `/` | `Navigate -> /dashboard` | Root redirect | Protected by `ProtectedPlatform` |
| `/dashboard` | `ExecutiveOverviewPage.tsx` | KPI & Forecasting | Shared component with analytics & sign-off |
| `/company-profile` | `CompanyProfilePage.tsx` | Organization & Charter | Corporate profile, chairs, regulatory mandates |
| `/departments` | `DepartmentsPage.tsx` | Organizational Units | Department health cards & creation |
| `/audits` | `AuditsManagementPage.tsx` | All Audit Engagements | Supports creation, status transitions, inspection |
| `/audits/financial` | `AuditsManagementPage.tsx` | Financial Audits | Passes `domainFilter="Financial"` + domain records |
| `/audits/hr` | `AuditsManagementPage.tsx` | HR & People Audits | Passes `domainFilter="HR"` + employee domain |
| `/audits/technology` | `AuditsManagementPage.tsx` | Technology & SecOps | Passes `domainFilter="Technology"` |
| `/audits/project` | `AuditsManagementPage.tsx` | Project Assurance | Passes `domainFilter="Project"` + projects/tasks |
| `/audits/customer` | `AuditsManagementPage.tsx` | Customer & SLA | Passes `domainFilter="Customer"` + customer accounts |
| `/audits/operations` | `AuditsManagementPage.tsx` | Operations Assurance | Passes `domainFilter="Operations"` |
| `/audits/checklists` | `AuditChecklistsPage.tsx` | Weighted Controls | Control disposition testing |
| `/audits/evidence` | `EvidenceManagementPage.tsx` | SHA-256 Vault | Workpaper upload, verify, download |
| `/audits/history` | `AuditHistoryPage.tsx` | Audit Trail Ledger | Append-only event stream + CSV export |
| `/risk-and-compliance` | `RiskComplianceMatrixPage.tsx` | 5x5 Heatmap & Matrix | Risk register, severity filters, mitigation updates |
| `/findings-and-actions` | `FindingsCorrectiveActionsPage.tsx` | Findings, CAPA & Recs | Exceptions, responses, actions, verification |
| `/ai-assistant` | `AiAuditAssistantPage.tsx` | AI Audit Workbench | Natural language queries & telemetry cards |
| `/reports` | `ReportsInsightsPage.tsx` | Reporting & Suites | Executive suites, period filter, print, distributions |
| `/notifications` | `NotificationsPage.tsx` | Alert & SLA Center | Read/unread filters & severity classification |
| `/settings` | `SettingsPage.tsx` | Platform Settings | Governance thresholds, SHA lock toggle, RBAC directory |

---

### 1.2 Backend API Modules (`backend/app/api/routes/`) & Database Entities (`backend/app/models/`)

**Registered FastAPI Routers (`/api`):**
- `auth.py`: `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/users`, `/auth/users/{id}/status`
- `company.py`: `/company`, `/departments`, `/departments/{id}`
- `audits.py`: `/audits`, `/audits/{id}`, `/checklists`, `/audits/{id}/responses`, `/domains/{domain}/records`
- `governance.py`: `/findings`, `/findings/{id}`, `/actions`, `/actions/{id}`, `/recommendations`, `/recommendations/{id}/respond`, `/risks`, `/risks/{id}`
- `evidence.py`: `/evidence`, `/evidence/{id}/verify`, `/evidence/{id}/download`
- `dashboard.py`: `/dashboard`, `/reports`, `/reports/{id}`, `/reports/{id}/export`, `/reports/ai-synthesis`, `/notifications`, `/notifications/{id}/read`, `/notifications/read-all`, `/history`, `/search`

**Database Entities (20 Baseline Tables + Phase 4 Additions):**
1. `companies` (`core.py`)
2. `users` (`core.py`)
3. `departments` (`core.py`)
4. `audits` (`audit.py`)
5. `audit_scopes` (`audit.py`)
6. `checklists` (`audit.py`)
7. `checklist_items` (`audit.py`)
8. `audit_responses` (`audit.py`)
9. `findings` (`governance.py`)
10. `risks` (`governance.py`)
11. `recommendations` (`governance.py`)
12. `corrective_actions` (`governance.py`)
13. `evidence` (`governance.py`)
14. `projects` (`domains.py`)
15. `project_tasks` (`domains.py`)
16. `employees` (`domains.py`)
17. `customers` (`domains.py`)
18. `financial_metrics` (`domains.py`)
19. `notifications` (`telemetry.py`)
20. `audit_history` (`telemetry.py`)

*Missing Operational Tables Identified:* `refresh_sessions` (DB-backed token rotation & theft revocation) and `distribution_rules` (scheduled governance distribution rules).

---

## 2. Prioritized Product Gap Report (P0 — P3)

### P0 — Critical Security, Trustworthiness & Data Integrity Gaps

| ID | Gap Description | Affected Modules / Files | Required Remediation |
| :--- | :--- | :--- | :--- |
| **G-P0-01** | **In-Memory Refresh Token Blacklist & Missing Reuse Detection:** `refresh_jti` is checked via Python `set` (`revoked_refresh_jtis`), wiped on worker restart, and lacks token-family theft detection. | `backend/app/core/security.py`, `backend/app/api/routes/auth.py`, `models/core.py` | Add `refresh_sessions` DB table tracking `token_family`, `token_hash`, `expires_at`, `revoked_at`, `replaced_by_id`. Implement reuse detection revoking full family and bumping `token_version`. |
| **G-P0-02** | **Missing CSRF & Origin Protection on Cookie Endpoints:** `/api/auth/refresh` and `/api/auth/logout` accept cookies without `Origin`/`Referer` verification or double-submit `X-CSRF-Token` validation. | `backend/app/api/routes/auth.py`, `src/services/apiClient.ts` | Issue `companyaudit_csrf` readable JS cookie alongside `HttpOnly` refresh cookie; enforce `X-CSRF-Token` header match + allowed `Origin`/`Referer` verification on cookie-based auth mutations. |
| **G-P0-03** | **Fabricated Time-Series Trend History in Live Analytics:** `forecasting.py` generates synthetic months (`Jan`–`May`) and arbitrary `-4.5` / `-7.2` period subtractions instead of PostgreSQL history. | `backend/app/analytics/forecasting.py` | Replace with true chronological DB aggregations across `AuditResponse`/`Audit`/`Finding` timestamps, reporting explicit `data_points_count` and `is_sufficient_for_forecast`. |
| **G-P0-04** | **Hardcoded Fallback Metrics & Fake Compliance Cards in Live `api` Mode:** Several pages render static numbers (`SOC 2 Type II 94%`, `18 Active`, `82%`, `4 / 4`) even when connected to PostgreSQL. | `ExecutiveOverviewPage.tsx`, `RiskComplianceMatrixPage.tsx`, `AiAuditAssistantPage.tsx`, `ReportsInsightsPage.tsx` | Restrict all static demo constants strictly to `mode === 'demo'`. Compute `framework_compliance` and evidence counts dynamically in backend; show honest empty/loading states in `api` mode. |
| **G-P0-05** | **AI Assistant RBAC Scoping Gap & Missing Honest Provider Status:** AI queries run tenant-wide even for `Department Head`, do not log queries to `audit_history`, and lack separation between verified DB facts vs. recommendations or external LLM unavailability notices. | `backend/app/analytics/reporting.py`, `backend/app/api/routes/dashboard.py`, `AiAuditAssistantPage.tsx` | Enforce `current_user.department_id` scoping for `Department Head`; log queries to `audit_history`; separate `verified_facts` vs `recommendations`; return explicit `provider_status` (`unavailable` when `AI_API_KEY` is absent). |
| **G-P0-06** | **Unchained Audit History Ledger:** `AuditHistory` computes independent row hashes without cryptographic linking (`prev_event_sha256`), making deleted or reordered rows undetectable. | `models/telemetry.py`, `services/audit_history.py`, `AuditHistoryPage.tsx` | Add `prev_event_sha256` hash chaining + canonical chain verification endpoint `GET /api/history/verify` + UI chain verification control. |
| **G-P0-07** | **Missing Rate Limiting & Unhandled Error Sanitization:** Auth login/refresh, evidence upload, and AI synthesis lack brute-force / resource throttling; `main.py` lacks structured reference-ID `500` error handler. | `backend/app/main.py`, `routes/auth.py`, `routes/evidence.py`, `routes/dashboard.py` | Implement sliding-window rate limiter (`429` + `Retry-After`) and sanitized global exception handler + structured JSON logs redacting tokens. |

---

### P1 — Incomplete Enterprise Business Workflows & State Gaps

| ID | Gap Description | Affected Modules / Files | Required Remediation |
| :--- | :--- | :--- | :--- |
| **G-P1-01** | **Settings `sha_lock_enabled` Toggle Not Persisted:** Toggle in `SettingsPage.tsx` updates local component state only; reloads reset value and backend has no column. | `models/core.py`, `schemas/company.py`, `routes/company.py`, `SettingsPage.tsx` | Add `sha_lock_enabled` boolean column on `companies` table, expose on `/company` `GET`/`PUT`, and persist via `SettingsPage`. |
| **G-P1-02** | **Incomplete Organization & User Management:** Company Charter edit modal omits `ticker`, `fiscal_year_label`, `regulatory_scope`; Departments lack `PUT` edit modal / `head_user_id` assignment / `DELETE` unit; Users lack profile/department edit & Admin password reset. | `CompanyProfilePage.tsx`, `DepartmentsPage.tsx`, `SettingsPage.tsx`, `routes/company.py`, `routes/auth.py` | Expose complete Charter editing, Department Edit & safe Delete (`409` if referenced), User department/title editing, and `POST /auth/users/{id}/reset-password`. |
| **G-P1-03** | **Incomplete Audit Scope, Engagement Edit & Control Workbench:** `audit_scopes` lacks API CRUD (`POST/PUT/DELETE`); audits cannot be edited in UI (`PUT /audits/{id}` form missing); checklists cannot create/edit controls or record custom `auditor_notes` (notes are hardcoded). | `routes/audits.py`, `schemas/audit.py`, `AuditsManagementPage.tsx`, `AuditChecklistsPage.tsx` | Implement `/audits/{id}/scopes` CRUD, `POST /checklists`, `POST /checklists/{id}/items`, `PUT /checklist-items/{id}`, custom notes input, Audit Edit modal, and "Raise Finding" shortcut on failed controls. |
| **G-P1-04** | **Incomplete CAPA Rejection/Reopen & Risk Residual Scoring:** Findings in `Verification Pending` cannot be rejected/reopened with reason back to `In Progress`; Findings/Actions lack safe `DELETE`; Risks expose inherent P×I only without editable residual P×I, `next_review_date`, or Critical escalation workflow. | `routes/governance.py`, `schemas/governance.py`, `FindingsCorrectiveActionsPage.tsx`, `RiskComplianceMatrixPage.tsx` | Add Finding `rejection_reason` + Reopen workflow, non-closed `DELETE`, editable residual P×I + `next_review_date` + `POST /risks/{id}/escalate` Board alert. |
| **G-P1-05** | **Evidence Flagging, Re-Association & Chain-of-Custody History Missing in UI:** Evidence table lacks Flag action (`Flagged`), re-linking modal (`audit_id`/`finding_id`/`tag`), and per-artifact `AuditHistory` inspection. | `routes/evidence.py`, `EvidenceManagementPage.tsx` | Add `PUT /evidence/{id}` metadata re-linking, `GET /evidence/{id}/history`, plus Flag & Re-associate buttons/modals in UI. |
| **G-P1-06** | **Report Binary Exports, Period Filter & Distribution Persistence Gaps:** Reports UI triggers browser `window.print()` instead of real server `.xlsx`/`.pdf` exports; `/reports/{id}` ignores `period`; Distribution Rules are local `useState` instead of PostgreSQL. | `analytics/reporting.py`, `routes/dashboard.py`, `models/governance.py`, `ReportsInsightsPage.tsx` | Add `openpyxl` (`.xlsx`) & `fpdf2` (`.pdf`) generators on `/reports/{id}/export?format=csv\|xlsx\|pdf&period=...`, honor `period`, and persist `distribution_rules` in PostgreSQL. |
| **G-P1-07** | **Dashboard Multi-Filter & KPI Coverage Gaps:** Dashboard lacks `date_from`, `date_to`, `department_id`, `domain`, `audit_status`, `risk_severity` filters; omits audit completion rate, overdue corrective actions, live framework breakdown, and evidence verification breakdown. | `analytics/scoring_analytics.py`, `routes/dashboard.py`, `ExecutiveOverviewPage.tsx` | Expand dashboard query params & response schema to compute all 10 KPIs dynamically and expose interactive filter bar + methodology popover. |
| **G-P1-08** | **Incomplete Notification Triggers & SLA Automation:** Several of the 8 enterprise triggers (new audit, deadline warnings, overdue audits, action deadlines, verification requests, management approvals, critical escalation) are absent or un-deduplicated; no background SLA sweep exists. | `services/notifications.py` (new), `models/telemetry.py`, `routes/*`, `NotificationsPage.tsx` | Implement deduplicated notification service (`dedup_key`), wire all 8 triggers, add `POST /api/notifications/run-sla-sweep` + guarded background scheduler. |

---

### P2 — Performance, Scalability & Production Readiness Gaps

| ID | Gap Description | Affected Modules / Files | Required Remediation |
| :--- | :--- | :--- | :--- |
| **G-P2-01** | **Frontend Single-Chunk Bundle > 1 MB & Missing Route Code Splitting:** All 14 page components and Recharts load eagerly in `src/App.tsx`. | `src/App.tsx`, `vite.config.ts` | Convert route pages to `React.lazy` + `Suspense` and configure Vite `manualChunks` (`react-vendor`, `recharts-vendor`, `lucide-vendor`) so all chunks stay under 500 kB. |
| **G-P2-02** | **Frontend Duplicate Initial API Fetches (`useCallback` Deps):** Placing default-initialized state variables (`createDeptId`, `newAuditDeptId`, `selectedAuditId`, `selectedFindingId`) inside `fetch*` dependency arrays causes redundant double fetches on mount. | `RiskComplianceMatrixPage.tsx`, `FindingsCorrectiveActionsPage.tsx`, `AuditsManagementPage.tsx`, `AuditChecklistsPage.tsx`, `EvidenceManagementPage.tsx` | Remove creation/selection state from fetch `useCallback` dependencies and use functional `setState(prev => prev \|\| default)` setters. |
| **G-P2-03** | **Backend N+1 Serialization Queries:** List endpoints (`/audits`, `/findings`, `/risks`, `/actions`, `/evidence`, `/departments`, `/auth/users`) execute per-row SQL queries inside loops (`serialize_*`). | `routes/audits.py`, `routes/governance.py`, `routes/evidence.py`, `routes/company.py`, `routes/auth.py` | Replace per-item queries with pre-fetched lookup dictionaries & grouped SQL aggregates; add composite DB indexes. |
| **G-P2-04** | **Production Deployment, Reverse Proxy & DB Backup Infrastructure Missing:** Only `docker-compose.yml` for dev Postgres exists; no production app containers, nginx `/api` proxy, security headers, or backup/restore scripts. | Root / `backend/` | Add multi-stage `Dockerfile` + `nginx.conf`, `backend/Dockerfile`, `docker-compose.prod.yml`, `backup_db.{ps1,sh}`, `restore_db.{ps1,sh}`, and operational runbooks. |

---

### P3 — Automated QA & Documentation Gaps

| ID | Gap Description | Affected Modules / Files | Required Remediation |
| :--- | :--- | :--- | :--- |
| **G-P3-01** | **Frontend Test Suite Absent:** `package.json` lacks Vitest / React Testing Library tests for components, forms, RBAC UI guards, and API/CSRF logic. | `package.json`, `src/__tests__/` | Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` and comprehensive frontend unit tests. |
| **G-P3-02** | **Backend Security & Workflow Regression Coverage Incomplete:** Existing 12 tests do not cover refresh reuse detection, CSRF blocking, rate limiting, scopes/checklists CRUD, residual risk, XLSX/PDF exports, hash-chain verification, or all 8 notification triggers. | `backend/tests/*.py` | Expand pytest suite to cover all Phase 4 security controls, workflows, analytics, exports, and SLA automation. |
| **G-P3-03** | **Production Documentation Suite Incomplete:** `docs/` directory does not yet exist for deployment, API reference, security review, or DR backup/restore procedures. | `docs/*.md` | Deliver `PRODUCT_GAP_ANALYSIS.md`, `PRODUCTION_READINESS_REPORT.md`, `DEPLOYMENT_GUIDE.md`, `API_DOCUMENTATION.md`, `SECURITY_REVIEW.md`, and `DATABASE_BACKUP_RESTORE.md`. |

