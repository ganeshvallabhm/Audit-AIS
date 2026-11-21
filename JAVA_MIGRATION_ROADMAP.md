# Enterprise Java Migration Roadmap & Transition Strategy
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Target Architecture:** React 19 + Spring Boot 3.4 (Java 21 LTS) + PostgreSQL 16  
**Migration Pattern:** Incremental Strangler Fig Pattern with Safe Rollback  
**Document Classification:** Execution Roadmap, Timeline & Transition Strategy  

---

## 1. Migration Strategy: The Strangler Fig Pattern

To eliminate operational risk and maintain 100% uptime, the migration does not follow a risky "Big Bang" cutover. Instead, it utilizes the **Strangler Fig Pattern** facilitated by the existing Nginx reverse proxy layer.

```mermaid
graph TD
    Client[React 19 Frontend SPA]

    subgraph Reverse Proxy Layer: Nginx
        Router{Nginx Path Router}
    end

    subgraph Phase 1-3: Partial Cutover
        JavaAuth[Spring Boot: Auth, Users, Security]
        PythonCore[Python FastAPI: Core Audits & Governance]
    end

    subgraph Phase 4-5: Full Migration
        JavaFull[Spring Boot: 100% Core Endpoints]
        PySidecar[Python AI Microservice: Scikit-learn Sidecar]
    end

    Postgres[(PostgreSQL 16 Shared Database)]

    Client -->|/api/*| Router
    Router -->|/api/auth/* (Migrated First)| JavaAuth
    Router -->|/api/audits/* (Legacy)| PythonCore
    JavaAuth --> Postgres
    PythonCore --> Postgres
    
    style JavaFull fill:#d4edda,stroke:#28a745
    style PySidecar fill:#d1ecf1,stroke:#17a2b8
```

### 1.1 Incremental Nginx Routing Configuration

During transitional phases, Nginx routes migrated endpoints directly to Spring Boot while routing unmigrated endpoints to FastAPI:

```nginx
# Stage A: Migrate Authentication & User Directory to Spring Boot
location /api/auth/ {
    proxy_pass http://backend-java:8080/api/auth/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

# Stage B: All other endpoints remain on Python FastAPI
location /api/ {
    proxy_pass http://backend-python:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Because both services connect to the same PostgreSQL 16 database, share identical password hashing (Argon2id), and use identical JWT signing keys (`JWT_SECRET_KEY`), users can authenticate on Spring Boot and execute actions on FastAPI seamlessly.

---

## 2. Phased Migration Schedule & Work Breakdown

```mermaid
gantt
    title CompanyAudit 14-Week Migration Schedule
    dateFormat  YYYY-MM-DD
    section Phase 0: Setup
    Spring Boot Scaffolding & Maven POM           :p0_1, 2026-12-01, 4d
    Flyway Baselining & Docker Dev Compose       :p0_2, after p0_1, 3d
    section Phase 1: Security & Auth
    Argon2id & Bouncy Castle Verification        :p1_1, after p0_2, 3d
    JJWT Token Provider & Filter Chain           :p1_2, after p1_1, 4d
    AuthController & RefreshSession Rotation      :p1_3, after p1_2, 5d
    User Directory & Password Resets             :p1_4, after p1_3, 3d
    section Phase 2: Domain Core
    JPA Entities: Core, Audits, Checklists       :p2_1, after p1_4, 5d
    Audit Lifecycle State Machine & Scoring      :p2_2, after p2_1, 7d
    Audit Scopes & Checklist Items CRUD          :p2_3, after p2_2, 4d
    section Phase 3: Governance & Files
    Findings, CAPA & Risk Matrix Endpoints       :p3_1, after p2_3, 7d
    Evidence Vault Service (Apache Tika + NIO)   :p3_2, after p3_1, 5d
    Enterprise SHA-256 Lock Logic                :p3_3, after p3_2, 2d
    section Phase 4: Telemetry & Ledger
    Cryptographic Hash Chain (AuditHistory)      :p4_1, after p3_3, 5d
    SLA Automation Scheduler & Notifications     :p4_2, after p4_1, 5d
    section Phase 5: Reporting & AI
    Apache POI (Excel) & OpenPDF Engines         :p5_1, after p4_2, 7d
    Python AI Microservice Sidecar Setup         :p5_2, after p5_1, 5d
    section Phase 6: Verification & Cutover
    React Integration Testing & Bug Squashing    :p6_1, after p5_2, 7d
    Performance Load Testing & Security Review   :p6_2, after p6_1, 4d
    Production Cutover & Decommissioning         :p6_3, after p6_2, 2d
```

---

## 3. Detailed Phase Execution Plan

### Phase 0: Infrastructure, Build & Flyway Baseline (Week 1)
- **Deliverables:** Maven project layout, Java 21 LTS configuration, Git structure.
- **Database Task:** Extract existing Alembic revisions into Flyway scripts `V1__initial_schema.sql` and `V2__phase4_security_notifications_reporting.sql`.
- **Flyway Setup:** Configure `spring.flyway.baseline-on-migrate=true` and `spring.flyway.baseline-version=2`.
- **Exit Criteria:** Clean compilation; Spring Boot boots against local PostgreSQL test database without errors.

### Phase 1: Security, Authentication & User Management (Weeks 2–3)
- **Deliverables:**
  - `Argon2PasswordEncoder` bean configured with `t=3, m=64MB, p=4`.
  - `JwtTokenProvider` handling HS256 access and refresh tokens.
  - `RefreshSessionRepository` and session rotation logic with theft detection.
  - `AuthController` implementing `/api/auth/login`, `/register`, `/me`, `/refresh`, `/logout`, `/users`, and `/reset-password`.
- **Verification:** Unit tests verifying password hashes created in Python match in Java; verifying JWTs emitted in Java decode in Python.

### Phase 2: Company Charter, Audits & Control Scoring (Weeks 4–5)
- **Deliverables:**
  - `CompanyController` and `DepartmentController` with scoring weight validations.
  - `AuditController`: Audit engagement CRUD, scope mapping, allowed transitions state machine (`ALLOWED_AUDIT_TRANSITIONS`).
  - `ChecklistController` and control response evaluation endpoint (`POST /api/audits/{id}/responses`).
  - Mathematical audit score formula:
    $$\text{Score} = \left(\frac{\sum (\text{factor} \times \text{weight})}{\sum \text{applicable\_weight}}\right) \times 100$$
- **Verification:** Precision testing verifying weighted scores match existing database records.

### Phase 3: Governance, CAPA, Risks & Evidence Vault (Weeks 6–7)
- **Deliverables:**
  - `GovernanceController`: Findings, recommendations, corrective actions (CAPA), and 5x5 threat risk matrix.
  - Role-based sign-off and rejection workflow.
  - `EvidenceStorageService`: 25 MB cap, Apache Tika magic-byte detection, disk SHA-256 calculation, and Enterprise SHA lock.
- **Verification:** Multi-part uploads tested with valid PDF/PNG/OOXML and malicious `.exe`/`.sh` extensions blocked.

### Phase 4: Telemetry, SLA Sweeper & Cryptographic Ledger (Weeks 8–9)
- **Deliverables:**
  - `AuditHistoryService`: Append-only cryptographic hash chain with canonical JSON hashing.
  - Sequential chain verification endpoint (`GET /api/history/verify`).
  - Spring `@Scheduled` task executing automated SLA sweeps every 900 seconds.
  - In-app notification deduplication and read state updates.
- **Verification:** Verification algorithm successfully validates all existing database history events from genesis.

### Phase 5: Reporting Engines & AI Microservice Sidecar (Weeks 10–11)
- **Deliverables:**
  - `ReportGenerationService`: Multi-tab `.xlsx` via Apache POI; landscape A4 PDF packages via OpenPDF; streaming CSV.
  - Python AI Sidecar: Extract `backend/app/analytics/forecasting.py` into a lightweight 200-line FastAPI container on port 5000.
  - Spring Boot `AnalyticsIntegrationService` calling AI Sidecar via HTTP.
- **Verification:** Generated PDF and Excel reports match existing visual formatting and metrics.

### Phase 6: End-to-End Integration, Dual-Run & Final Cutover (Weeks 12–14)
- **Deliverables:**
  - Automated integration tests running the React frontend against the Spring Boot API.
  - Load testing using k6 or JMeter asserting sub-50ms API latencies under 500 concurrent users.
  - Update `docker-compose.prod.yml` to launch Spring Boot as the primary backend.
  - Full production cutover and graceful decommissioning of the legacy Python service.

---

## 4. Rollback & Disaster Recovery Strategy

In the event of an unforeseen production blocker during the migration cutover:

1. **Zero Database Rollback Needed:** Because the PostgreSQL database schema is untouched, the legacy Python backend can reconnect immediately without data restoration or migration reversal.
2. **Instant Nginx Switch:** Reverting the Nginx `proxy_pass` destination from `http://backend-java:8080` back to `http://backend-python:8000` restores full legacy operation in under 5 seconds:
   ```powershell
   # Instant rollback command
   docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
   ```
3. **Session Compatibility:** Because both services share the exact same JWT secret key and database `refresh_sessions` table, active user sessions remain valid across rollbacks.
