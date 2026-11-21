# Enterprise Java Backend Implementation Checklist
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Target:** Spring Boot 3.4.x / Java 21 LTS  
**Purpose:** Actionable Engineering Task Verification & Quality Assurance  

---

## 1. Project Initialization & Build Setup
- [ ] Initialize Maven project with Spring Boot 3.4.x and Java 21 LTS compiler settings.
- [ ] Enable Java 21 Virtual Threads (`spring.threads.virtual.enabled=true`).
- [ ] Add all required dependencies to `pom.xml`:
  - [ ] `spring-boot-starter-web`
  - [ ] `spring-boot-starter-security`
  - [ ] `spring-boot-starter-data-jpa`
  - [ ] `spring-boot-starter-validation`
  - [ ] `spring-boot-starter-actuator`
  - [ ] `postgresql` JDBC driver
  - [ ] `flyway-core` & `flyway-database-postgresql`
  - [ ] `jjwt-api`, `jjwt-impl`, `jjwt-jackson` (v0.12.x)
  - [ ] `bcprov-jdk18on` (Bouncy Castle for Argon2id)
  - [ ] `tika-core` (Apache Tika for magic bytes)
  - [ ] `poi-ooxml` (Apache POI for Excel exports)
  - [ ] `openpdf` (PDF report rendering)
  - [ ] `commons-csv` (CSV streaming)
  - [ ] `bucket4j-core` (Sliding-window rate limiting)
  - [ ] `logstash-logback-encoder` (Structured JSON logging)
  - [ ] `lombok`
- [ ] Configure `application.yml` and `application-prod.yml` with property bindings.
- [ ] Set `spring.jpa.hibernate.ddl-auto=validate` to prevent automated schema mutations.

---

## 2. Database & Flyway Baselining
- [ ] Extract Alembic revision `d72d5d8ca631` into `src/main/resources/db/migration/V1__initial_schema.sql`.
- [ ] Extract Alembic revision `9a553dc0bf47` into `src/main/resources/db/migration/V2__phase4_security_notifications_reporting.sql`.
- [ ] Configure Flyway baseline settings:
  - [ ] `spring.flyway.baseline-on-migrate=true`
  - [ ] `spring.flyway.baseline-version=2`
  - [ ] `spring.flyway.baseline-description="Alembic Phase 4 Baseline"`
- [ ] Test Flyway execution against an isolated PostgreSQL test instance.

---

## 3. JPA Domain Entity Implementations (22 Tables)
- [ ] Create `BaseTimestampEntity` mapped superclass (`created_at`, `updated_at`).
- [ ] Implement `CompanyEntity` (`companies` table, JSONB `regulatory_scope`).
- [ ] Implement `DepartmentEntity` (`departments` table, scoring weights).
- [ ] Implement `UserEntity` (`users` table, Argon2 hash, role, token version).
- [ ] Implement `RefreshSessionEntity` (`refresh_sessions` table, token family, hash).
- [ ] Implement `AuditEntity` (`audits` table, status lifecycle, computed score).
- [ ] Implement `AuditScopeEntity` (`audit_scopes` table).
- [ ] Implement `ChecklistEntity` (`checklists` table).
- [ ] Implement `ChecklistItemEntity` (`checklist_items` table, control weight).
- [ ] Implement `AuditResponseEntity` (`audit_responses` table, factor, notes).
- [ ] Implement `FindingEntity` (`findings` table, root cause, severity, sign-off).
- [ ] Implement `RecommendationEntity` (`recommendations` table).
- [ ] Implement `CorrectiveActionEntity` (`corrective_actions` table, CAPA progress).
- [ ] Implement `RiskEntity` (`risks` table, generated column `inherent_score`, JSONB frameworks).
- [ ] Implement `EvidenceEntity` (`evidence` table, SHA-256 hash, byte size).
- [ ] Implement `DistributionRuleEntity` (`distribution_rules` table).
- [ ] Implement `NotificationEntity` (`notifications` table, dedup key).
- [ ] Implement `AuditHistoryEntity` (`audit_history` table, event SHA-256, prev SHA-256).
- [ ] Implement `ProjectEntity` (`projects` table).
- [ ] Implement `ProjectTaskEntity` (`project_tasks` table).
- [ ] Implement `EmployeeEntity` (`employees` table).
- [ ] Implement `CustomerEntity` (`customers` table).
- [ ] Implement `FinancialMetricEntity` (`financial_metrics` table).

---

## 4. Repositories & Data Access Layer
- [ ] Implement `CompanyRepository` (find by id, find active).
- [ ] Implement `UserRepository` (`findByCompanyIdAndEmailIgnoreCase`).
- [ ] Implement `RefreshSessionRepository` (`findByTokenHash`, `revokeFamily`, pessimistic lock).
- [ ] Implement `DepartmentRepository` (check duplicate code, check foreign key usage).
- [ ] Implement `AuditRepository` (paginated queries with domain, status, and department filters).
- [ ] Implement `AuditResponseRepository` (load by audit and checklist item).
- [ ] Implement `FindingRepository` (filter by SLA, severity, status, department).
- [ ] Implement `CorrectiveActionRepository` (filter by assignee and due date).
- [ ] Implement `RiskRepository` (5x5 matrix aggregation queries).
- [ ] Implement `EvidenceRepository` (find by storage key, find by audit/finding).
- [ ] Implement `NotificationRepository` (user unread queries with partial unique dedup).
- [ ] Implement `AuditHistoryRepository` (sequential traversal query, tip hash lookup).

---

## 5. Security & Authentication Engine
- [ ] Configure `Argon2PasswordEncoder` with identical parameters (`t=3, m=65536, p=4, salt=16, hash=32`).
- [ ] Implement `JwtTokenProvider` using JJWT (HS256 signing, claims `sub`, `cid`, `role`, `ver`).
- [ ] Implement `JwtAuthenticationFilter` (`OncePerRequestFilter`) validating access tokens.
- [ ] Implement `DoubleSubmitCsrfFilter` verifying `companyaudit_csrf` cookie against `X-CSRF-Token` header.
- [ ] Implement `SecurityFilterChain`:
  - [ ] Permit public access to `/api/health`, `/api/auth/login`, `/api/auth/refresh`.
  - [ ] Require authentication on all other `/api/**` paths.
  - [ ] Enable method security (`@EnableMethodSecurity`).
- [ ] Implement CORS configuration matching `CORS_ORIGINS`.
- [ ] Implement rate-limiting filter using Bucket4j for `/api/auth/login` and `/api/evidence`.

---

## 6. Business Service Layer
- [ ] **`AuthService`:**
  - [ ] Authenticate with Argon2id; return JWT + write HttpOnly refresh cookie + CSRF cookie.
  - [ ] Atomic refresh rotation with token family reuse invalidation.
  - [ ] User logout (revoke all user sessions, increment `token_version`).
  - [ ] User registration, update, and admin password reset.
- [ ] **`AuditScoringService`:**
  - [ ] Recalculate audit score from responses (excluding `N/A`).
  - [ ] Enforce `ALLOWED_AUDIT_TRANSITIONS` state machine.
- [ ] **`EvidenceVaultService`:**
  - [ ] 25 MB size cap enforcement (`MAX_EVIDENCE_BYTES`).
  - [ ] File extension blacklist checking.
  - [ ] Apache Tika magic-byte signature verification.
  - [ ] Storage key generation outside web root (`<company_id>/<uuid><ext>`).
  - [ ] On-the-fly disk SHA-256 recalculation on download and verify.
  - [ ] Enterprise SHA Lock enforcement (`sha_lock_enabled`).
- [ ] **`AuditHistoryService`:**
  - [ ] Deterministic canonical JSON formatting with sorted keys.
  - [ ] SHA-256 hash calculation linking `prev_event_sha256`.
  - [ ] Sequential blockchain-like verification algorithm (`verify_company_history_chain`).
- [ ] **`SlaAutomationService`:**
  - [ ] `@Scheduled` task running every 900 seconds.
  - [ ] Overdue audits, overdue CAPA actions, and critical risk sweep.
  - [ ] Deduplicated in-app notification dispatch.
- [ ] **`ReportGenerationService`:**
  - [ ] Multi-tab styled Excel generation via Apache POI.
  - [ ] Landscape A4 executive audit pack PDF generation via OpenPDF.
  - [ ] RFC 4180 CSV export generation.

---

## 7. REST Controllers & DTOs (All 58 Endpoints)
- [ ] `HealthController` (`GET /api/health`).
- [ ] `AuthController` (`/api/auth/*` - 8 endpoints).
- [ ] `CompanyController` (`/api/company`, `/api/departments/*` - 6 endpoints).
- [ ] `AuditController` (`/api/audits/*`, `/api/checklists/*` - 13 endpoints).
- [ ] `GovernanceController` (`/api/findings/*`, `/api/actions/*`, `/api/risks/*` - 14 endpoints).
- [ ] `EvidenceController` (`/api/evidence/*` - 6 endpoints).
- [ ] `DashboardController` (`/api/dashboard/*`, `/api/reports/*`, `/api/notifications/*`, `/api/history/*` - 11 endpoints).
- [ ] Verify every controller returns exact JSON schema matching TypeScript [`src/types/api.ts`](file:///C:/Users/GANESH%20VALLABH%20M/.gemini/antigravity/scratch/companyaudit-platform/src/types/api.ts).

---

## 8. Exception Handling & Diagnostics
- [ ] Implement `@RestControllerAdvice` formatting errors as `{"detail": "...", "error_ref": "..."}`.
- [ ] Implement `X-Request-ID` filter propagating tracing IDs into MDC.
- [ ] Configure Logback JSON encoder with credential masking regex.

---

## 9. Quality Assurance & Testing Suite
- [ ] **Password Parity Test:** Verify Java `Argon2PasswordEncoder` successfully verifies password hashes created by Python's `pwdlib`.
- [ ] **Token Parity Test:** Verify JWTs issued by Spring Boot decode seamlessly in Python and vice-versa.
- [ ] **Hash Chain Parity Test:** Verify `CryptographicHashUtils` generates identical SHA-256 digests for existing `audit_history` records.
- [ ] **Score Formula Test:** Verify weighted audit score calculation matches Python arithmetic down to 2 decimal places.
- [ ] **Evidence Vault Security Test:** Verify that malicious `.exe`, `.bat`, or corrupted PDF headers are rejected with HTTP 415.
- [ ] **Frontend Contract Test:** Run React 19 test suite (`npm test`) against running Spring Boot instance; verify 100% passing tests.

---

## 10. Containerization & Deployment
- [ ] Create multi-stage `Dockerfile` (Eclipse Temurin 21 Alpine runtime, non-root user).
- [ ] Configure container healthcheck (`/actuator/health`).
- [ ] Update `docker-compose.prod.yml` to orchestrate Spring Boot, Nginx, PostgreSQL, and Python AI Sidecar.
- [ ] Perform staging deployment, verify live React UI in browser, and validate zero console errors.
