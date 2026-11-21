# Python-to-Java REST API Compatibility Matrix
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Total Endpoints Audited:** 58 Endpoints  
**Target Architecture:** Spring Boot 3.4.x `@RestController` Mappings  
**Document Classification:** Endpoint-by-Endpoint Technical Parity Specification  

---

## 1. Global Compatibility Principles

To ensure the existing React 19 / TypeScript frontend functions without modifications:
1. **Identical Paths & HTTP Verbs:** All `@GetMapping`, `@PostMapping`, `@PutMapping`, and `@DeleteMapping` annotations must match the existing FastAPI route definitions under `/api`.
2. **Identical JSON Property Names:** All Java DTO records must use `snake_case` JSON property naming matching Python Pydantic models (enforced globally via Jackson `PropertyNamingStrategies.SNAKE_CASE` or explicit `@JsonProperty`).
3. **Identical Cookie & Header Semantics:**
   - Auth Cookies: `companyaudit_refresh` (HttpOnly), `companyaudit_csrf` (readable).
   - Response Headers: `X-Request-ID`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-Evidence-SHA256`.
4. **Identical Status Codes:** `200 OK`, `201 Created`, `204 No Content`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `413 Payload Too Large`, `415 Unsupported Media Type`, `422 Unprocessable Entity`, `429 Too Many Requests`, `500 Internal Server Error`.

---

## 2. Complete Endpoint Inventory & Compatibility Matrix

### 2.1 System Health (`/api`)

| Method | Endpoint Path | FastAPI Source Handler | Target Spring Controller & Method | Request DTO | Response DTO | RBAC Rule | Status Code | Migration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | `app.main:health_check` | `HealthController:healthCheck` | None | `HealthResponse` | Public | `200 OK` | **VERIFIED (Phase 0)** |

---

### 2.2 Authentication & User Directory (`/api/auth`)

| Method | Endpoint Path | FastAPI Source Handler | Target Spring Controller & Method | Request DTO | Response DTO | RBAC Rule | Status Code | Migration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | `routes.auth:login` | `AuthController:login` | `LoginRequest` | `TokenResponse` + Cookies | Public | `200 OK` | **VERIFIED (Phase 1)** |
| `POST` | `/api/auth/register` | `routes.auth:register_user` | `UserController:registerUser` | `RegisterUserRequest` | `UserSummary` | `Admin` | `201 Created` | **VERIFIED (Phase 2)** |
| `GET` | `/api/auth/me` | `routes.auth:get_current_user_profile` | `AuthController:getMe` | None | `UserSummary` | All Auth | `200 OK` | **VERIFIED (Phase 1)** |
| `POST` | `/api/auth/refresh` | `routes.auth:refresh_session` | `AuthController:refreshSession` | Cookie + `X-CSRF-Token` | `TokenResponse` + Cookies | Public | `200 OK` | **VERIFIED (Phase 1)** |
| `POST` | `/api/auth/logout` | `routes.auth:logout` | `AuthController:logout` | `X-CSRF-Token` | `MessageResponse` | All Auth | `200 OK` | **VERIFIED (Phase 1)** |
| `GET` | `/api/auth/users` | `routes.auth:list_company_users` | `UserController:listUsers` | None | `List<UserSummary>` | All Auth | `200 OK` | **VERIFIED (Phase 2)** |
| `PUT` | `/api/auth/users/{user_id}` | `routes.auth:update_user_profile` | `UserController:updateUser` | `UserUpdateRequest` | `UserSummary` | `Admin` | `200 OK` | **VERIFIED (Phase 2)** |
| `POST` | `/api/auth/users/{user_id}/reset-password` | `routes.auth:admin_reset_password` | `UserController:resetPassword` | `AdminResetPasswordRequest` | `MessageResponse` | `Admin` | `200 OK` | **VERIFIED (Phase 2)** |

---

### 2.3 Company Profile & Departments (`/api`)

| Method | Endpoint Path | FastAPI Source Handler | Target Spring Controller & Method | Request DTO | Response DTO | RBAC Rule | Status Code | Migration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/company` | `routes.company:get_company_profile` | `CompanyController:getCompany` | None | `CompanyProfileOut` | All Auth | `200 OK` | **VERIFIED (Phase 2)** |
| `PUT` | `/api/company` | `routes.company:update_company_profile` | `CompanyController:updateCompany` | `CompanyProfileUpdate` | `CompanyProfileOut` | `Admin`, `Management` | `200 OK` | **VERIFIED (Phase 2)** |
| `POST` | `/api/companies` | N/A (Admin Provisioning) | `CompanyController:createCompany` | `CompanyCreateRequest` | `CompanyProfileOut` | `Admin` | `201 Created` | **VERIFIED (Phase 2)** |
| `GET` | `/api/departments` | `routes.company:list_departments` | `DepartmentController:listDepartments` | None | `List<DepartmentOut>` | All Auth | `200 OK` | **VERIFIED (Phase 2)** |
| `GET` | `/api/departments/{id}` | N/A (Detail lookup) | `DepartmentController:getDepartment` | None | `DepartmentOut` | All Auth | `200 OK` | **VERIFIED (Phase 2)** |
| `POST` | `/api/departments` | `routes.company:create_department` | `DepartmentController:createDepartment` | `DepartmentCreate` | `DepartmentOut` | `Admin` | `201 Created` | **VERIFIED (Phase 2)** |
| `PUT` | `/api/departments/{department_id}` | `routes.company:update_department` | `DepartmentController:updateDepartment` | `DepartmentUpdate` | `DepartmentOut` | `Admin` | `200 OK` | **VERIFIED (Phase 2)** |
| `DELETE` | `/api/departments/{department_id}` | `routes.company:delete_department` | `DepartmentController:deleteDepartment` | None | `MessageResponse` | `Admin` | `200 OK` | **VERIFIED (Phase 2)** |

---

### 2.4 Audits, Scopes, Checklists & Control Responses (`/api`)

| Method | Endpoint Path | FastAPI Source Handler | Target Spring Controller & Method | Request DTO | Response DTO | RBAC Rule | Status Code | Migration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/audits` | `routes.audits:list_audits` | `AuditController:listAudits` | Query Params | `PaginatedResponse<AuditOut>` | All Auth | `200 OK` | **VERIFIED (Phase 3)** |
| `POST` | `/api/audits` | `routes.audits:create_audit` | `AuditController:createAudit` | `AuditCreate` | `AuditOut` | `Admin`, `Auditor` | `201 Created` | **VERIFIED (Phase 3)** |
| `GET` | `/api/audits/{audit_id}` | `routes.audits:get_audit_detail` | `AuditController:getAudit` | None | `AuditOut` | All Auth | `200 OK` | **VERIFIED (Phase 3)** |
| `PUT` | `/api/audits/{audit_id}` | `routes.audits:update_audit` | `AuditController:updateAudit` | `AuditUpdate` | `AuditOut` | `Admin`, `Auditor` | `200 OK` | **VERIFIED (Phase 3)** |
| `POST` | `/api/audits/{audit_id}/scopes` | `routes.audits:add_audit_scope` | `AuditController:addScope` | `AuditScopeCreate` | `AuditScopeOut` | `Admin`, `Auditor` | `201 Created` | **VERIFIED (Phase 3)** |
| `PUT` | `/api/audits/{audit_id}/scopes/{scope_id}` | `routes.audits:update_audit_scope` | `AuditController:updateScope` | `AuditScopeUpdate` | `AuditScopeOut` | `Admin`, `Auditor` | `200 OK` | **VERIFIED (Phase 3)** |
| `DELETE` | `/api/audits/{audit_id}/scopes/{scope_id}` | `routes.audits:delete_audit_scope` | `AuditController:deleteScope` | None | `MessageResponse` | `Admin`, `Auditor` | `200 OK` | **VERIFIED (Phase 3)** |
| `GET` | `/api/checklists` (also `/api/audit-templates`) | `routes.audits:list_checklists` | `ChecklistController:listChecklists` | Query: `domain` | `List<ChecklistOut>` | All Auth | `200 OK` | **VERIFIED (Phase 2)** |
| `GET` | `/api/checklists/{id}` (also `/api/audit-templates/{id}`) | N/A (Checklist detail) | `ChecklistController:getChecklist` | None | `ChecklistOut` | All Auth | `200 OK` | **VERIFIED (Phase 2)** |
| `POST` | `/api/checklists` (also `/api/audit-templates`) | `routes.audits:create_checklist` | `ChecklistController:createChecklist` | `ChecklistCreate` | `ChecklistOut` | `Admin`, `Auditor` | `201 Created` | **VERIFIED (Phase 2)** |
| `POST` | `/api/checklists/{checklist_id}/items` | `routes.audits:add_checklist_item` | `ChecklistController:addItem` | `ChecklistItemCreate` | `ChecklistItemOut` | `Admin`, `Auditor` | `201 Created` | **VERIFIED (Phase 2)** |
| `PUT` | `/api/checklist-items/{item_id}` | `routes.audits:update_checklist_item` | `ChecklistController:updateItem` | `ChecklistItemUpdate` | `ChecklistItemOut` | `Admin`, `Auditor` | `200 OK` | **VERIFIED (Phase 2)** |
| `GET` | `/api/audits/{audit_id}/responses` | `routes.audits:list_audit_responses` | `AuditController:getResponses` | None | `List<AuditResponseOut>` | All Auth | `200 OK` | **VERIFIED (Phase 3)** |
| `POST` | `/api/audits/{audit_id}/responses` | `routes.audits:submit_audit_responses` | `AuditController:submitResponses` | `SubmitAuditResponsesRequest` | `SubmitAuditResponsesResult` | `Admin`, `Auditor` | `200 OK` | **VERIFIED (Phase 3)** |

---

### 2.5 Governance: Findings, CAPA & Risks (`/api`)

| Method | Endpoint Path | FastAPI Source Handler | Target Spring Controller & Method | Request DTO | Response DTO | RBAC Rule | Status Code | Migration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/findings` | `routes.governance:list_findings` | `FindingController:listFindings` | Query Params | `PaginatedResponse<FindingOut>` | All Auth | `200 OK` | **VERIFIED (Phase 4)** |
| `POST` | `/api/findings` | `routes.governance:create_finding` | `FindingController:createFinding` | `FindingCreate` | `FindingOut` | `Admin`, `Auditor` | `201 Created` | **VERIFIED (Phase 4)** |
| `PUT` | `/api/findings/{finding_id}` | `routes.governance:update_finding` | `FindingController:updateFinding` | `FindingUpdate` | `FindingOut` | RBAC Matrix (Dept Confinement) | `200 OK` | **VERIFIED (Phase 4)** |
| `DELETE` | `/api/findings/{finding_id}` | `routes.governance:delete_finding` | `FindingController:deleteFinding` | None | `MessageResponse` | `Admin`, `Auditor` | `200 OK` | **VERIFIED (Phase 4)** |
| `POST` | `/api/recommendations` | `routes.governance:create_recommendation` | `FindingController:createRecommendation` | `RecommendationCreate` | `RecommendationOut` | `Admin`, `Auditor` | `201 Created` | **VERIFIED (Phase 4)** |
| `POST` | `/api/recommendations/{recommendation_id}/respond` | `routes.governance:respond_recommendation` | `FindingController:respondRecommendation` | `RecommendationRespondRequest` | `RecommendationOut` | `Admin`, `Mgmt`, `Dept Head` | `200 OK` | **VERIFIED (Phase 4)** |
| `GET` | `/api/actions` | `routes.governance:list_corrective_actions` | `CorrectiveActionController:listActions` | Query Params | `PaginatedResponse<CorrectiveActionOut>` | All Auth | `200 OK` | **VERIFIED (Phase 4)** |
| `POST` | `/api/actions` | `routes.governance:create_corrective_action` | `CorrectiveActionController:createAction` | `CorrectiveActionCreate` | `CorrectiveActionOut` | `Admin`, `Auditor`, `Dept Head` | `201 Created` | **VERIFIED (Phase 4)** |
| `PUT` | `/api/actions/{action_id}` | `routes.governance:update_corrective_action` | `CorrectiveActionController:updateAction` | `CorrectiveActionUpdate` | `CorrectiveActionOut` | RBAC Matrix | `200 OK` | **VERIFIED (Phase 4)** |
| `DELETE` | `/api/actions/{action_id}` | `routes.governance:delete_corrective_action` | `CorrectiveActionController:deleteAction` | None | `MessageResponse` | `Admin`, `Auditor` | `200 OK` | **VERIFIED (Phase 4)** |
| `GET` | `/api/risks` | `routes.governance:list_risks` | `RiskController:listRisks` | Query Params | `PaginatedResponse<RiskOut>` | All Auth | `200 OK` | **VERIFIED (Phase 4)** |
| `POST` | `/api/risks` | `routes.governance:create_risk` | `RiskController:createRisk` | `RiskCreate` | `RiskOut` | `Admin`, `Auditor` | `201 Created` | **VERIFIED (Phase 4)** |
| `PUT` | `/api/risks/{risk_id}` | `routes.governance:update_risk` | `RiskController:updateRisk` | `RiskUpdate` | `RiskOut` | `Admin`, `Auditor`, `Mgmt` | `200 OK` | **VERIFIED (Phase 4)** |
| `POST` | `/api/risks/{risk_id}/escalate` | `routes.governance:escalate_risk` | `RiskController:escalateRisk` | `RiskEscalateRequest` | `RiskOut` | `Admin`, `Auditor`, `Mgmt` | `200 OK` | **VERIFIED (Phase 4)** |

---

### 2.6 Evidence Vault (`/api/evidence`)

| Method | Endpoint Path | FastAPI Source Handler | Target Spring Controller & Method | Request DTO | Response DTO | RBAC Rule | Status Code | Migration Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/evidence` | `routes.evidence:list_evidence` | `EvidenceController:listEvidence` | Query Params | `PaginatedResponse<EvidenceOut>` | All Auth | `200 OK` | **VERIFIED (Phase 4)** |
| `POST` | `/api/evidence` | `routes.evidence:upload_evidence` | `EvidenceController:uploadEvidence` | Multipart Form | `EvidenceOut` | `Admin`, `Auditor`, `Dept Head` | `201 Created` | **VERIFIED (Phase 4)** |
| `GET` | `/api/evidence/{evidence_id}/download` | `routes.evidence:download_evidence` | `EvidenceController:downloadEvidence` | None | Binary Stream + SHA Header | All Auth | `200 OK` | **VERIFIED (Phase 4)** |
| `PUT` | `/api/evidence/{evidence_id}/verify` | `routes.evidence:verify_evidence` | `EvidenceController:verifyEvidence` | `EvidenceVerifyRequest` | `EvidenceOut` | `Admin`, `Auditor` | `200 OK` | **VERIFIED (Phase 4)** |
| `PUT` | `/api/evidence/{evidence_id}` | `routes.evidence:update_evidence` | `EvidenceController:updateEvidence` | `EvidenceUpdate` | `EvidenceOut` | `Admin`, `Auditor` (SHA Lock check) | `200 OK` | **VERIFIED (Phase 4)** |
| `GET` | `/api/evidence/{evidence_id}/history` | `routes.evidence:get_evidence_history` | `EvidenceController:getEvidenceHistory` | None | `List<AuditHistoryOut>` | All Auth | `200 OK` | **VERIFIED (Phase 4)** |

---

### 2.7 Dashboard, Reports, Notifications, Telemetry (`/api`)

| Method | Endpoint Path | FastAPI Source Handler | Target Spring Controller & Method | Request DTO | Response DTO | RBAC Rule | Status Code |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard` | `routes.dashboard:get_dashboard_overview` | `DashboardController:getOverview` | Query: `period` | `DashboardOverviewOut` | All Auth | `200 OK` |
| `GET` | `/api/dashboard/department-performance` | `routes.dashboard:get_department_performance` | `DashboardController:getDeptPerformance` | None | `List<DepartmentOut>` | All Auth | `200 OK` |
| `GET` | `/api/dashboard/risk-distribution` | `routes.dashboard:get_risk_distribution` | `DashboardController:getRiskDistribution` | None | `RiskDistributionOut` | All Auth | `200 OK` |
| `GET` | `/api/search` | `routes.dashboard:global_search` | `DashboardController:globalSearch` | Query: `q` | `GlobalSearchResponse` | All Auth | `200 OK` |
| `GET` | `/api/reports` | `routes.dashboard:list_reports` | `ReportController:listReports` | None | `List<ReportSuiteOut>` | All Auth | `200 OK` |
| `GET` | `/api/reports/distributions` | `routes.dashboard:list_distribution_rules` | `ReportController:listDistributions` | None | `List<DistributionRuleOut>` | All Auth | `200 OK` |
| `POST` | `/api/reports/distributions` | `routes.dashboard:create_distribution_rule` | `ReportController:createDistribution` | `DistributionRuleCreate` | `DistributionRuleOut` | `Admin`, `Auditor`, `Mgmt` | `201 Created` |
| `PUT` | `/api/reports/distributions/{rule_id}` | `routes.dashboard:update_distribution_rule` | `ReportController:updateDistribution` | `DistributionRuleUpdate` | `DistributionRuleOut` | `Admin`, `Auditor`, `Mgmt` | `200 OK` |
| `DELETE` | `/api/reports/distributions/{rule_id}` | `routes.dashboard:delete_distribution_rule` | `ReportController:deleteDistribution` | None | `MessageResponse` | `Admin`, `Auditor`, `Mgmt` | `200 OK` |
| `POST` | `/api/reports/ai-synthesis` | `routes.dashboard:run_ai_synthesis` | `ReportController:runAiSynthesis` | `AiSynthesisRequest` | `AiSynthesisResponse` | All Auth (Dept Confinement) | `200 OK` |
| `GET` | `/api/reports/{report_id}/export` | `routes.dashboard:export_report` | `ReportController:exportReport` | Query: `format` | Binary Stream (`pdf`/`xlsx`/`csv`) | All Auth | `200 OK` |
| `GET` | `/api/reports/{report_id}` | `routes.dashboard:get_report` | `ReportController:getReportDetail` | None | `ReportDetailOut` | All Auth | `200 OK` |
| `GET` | `/api/notifications` | `routes.dashboard:list_notifications` | `NotificationController:list` | None | `List<NotificationOut>` | All Auth | `200 OK` |
| `PUT` | `/api/notifications/{notification_id}/read` | `routes.dashboard:mark_notification_read` | `NotificationController:markRead` | None | `NotificationOut` | All Auth | `200 OK` |
| `PUT` | `/api/notifications/read-all` | `routes.dashboard:mark_all_notifications_read`| `NotificationController:markAllRead` | None | `MessageResponse` | All Auth | `200 OK` |
| `POST` | `/api/notifications/run-sla-sweep` | `routes.dashboard:trigger_manual_sla_sweep` | `NotificationController:runSlaSweep` | None | `SlaSweepResultOut` | `Admin`, `Auditor` | `200 OK` |
| `GET` | `/api/history` | `routes.dashboard:list_audit_history` | `AuditHistoryController:listHistory` | Query Params | `PaginatedResponse<AuditHistoryOut>` | All Auth | `200 OK` |
| `GET` | `/api/history/verify` | `routes.dashboard:verify_audit_history_ledger`| `AuditHistoryController:verifyLedger` | None | `AuditHistoryVerifyOut` | All Auth | `200 OK` |
| `GET` | `/api/domains/{domain}/telemetry` | `routes.dashboard:get_domain_telemetry` | `DomainController:getTelemetry` | Path: `domain` | `DomainTelemetryOut` | All Auth | `200 OK` |
