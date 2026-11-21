# CompanyAudit — Python-to-Java Migration Gap Analysis
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Source Stack:** Python 3.13 / FastAPI 0.115 / SQLAlchemy 2.0 / Alembic / Pydantic v2  
**Target Stack:** Java 17/21 LTS / Spring Boot 3.4.x / Spring Data JPA / Hibernate 6 / Flyway  
**Document Purpose:** Architectural Gap Identification, Risk Assessment & Resolution Strategies  

---

## 1. Executive Gap Assessment

This technical gap analysis assesses the architectural, operational, and runtime differences between the existing Python FastAPI backend and the target Java Spring Boot backend. 

### Summary Risk Scorecard

| Architectural Domain | Complexity | Parity Risk | Primary Mitigation |
| :--- | :--- | :--- | :--- |
| **Authentication & Cryptography** | Medium | High | Exact parameter alignment for Argon2id (`t=3, m=64MB, p=4`) & JJWT claims schema |
| **Audit Ledger Hash Chaining** | High | Critical | Canonical JSON sorting (`separators=(',', ':')`) & SHA-256 digest equality |
| **Relational Data Mapping** | Medium | Low | Hibernate 6 native JSONB & UUID mapping; `ddl-auto=validate` to prevent mutations |
| **Predictive Analytics (ML)** | High | Medium | Decouple Scikit-learn OLS model into internal Python AI microservice sidecar |
| **Evidence Vault & File I/O** | Medium | Low | Apache Tika magic-byte detection & Java NIO non-blocking disk channels |
| **Background Scheduling** | Low | Low | Replace `asyncio` task loop with Spring `@Scheduled` / ShedLock |
| **Binary Reporting** | Medium | Low | Apache POI (`.xlsx`) & OpenPDF (landscape A4 `.pdf`) template replication |

---

## 2. Granular Gap Breakdown

### 2.1 Language Runtime & Concurrency Model

- **Existing Python Architecture:**
  - Runtime: Python 3.13 (single-threaded event loop via `asyncio` + synchronous worker threads for blocking DB I/O).
  - Framework: FastAPI with Uvicorn ASGI server.
  - Concurrency: Async endpoint signatures (`async def`) and sync database sessions managed via `SessionLocal()`.
- **Target Java Architecture:**
  - Runtime: Java 17 LTS / Java 21 LTS with Virtual Threads (Project Loom).
  - Framework: Spring Boot 3.4.x with Embedded Tomcat.
  - Concurrency: Lightweight virtual threads (`spring.threads.virtual.enabled=true`) allowing standard synchronous blocking code with high concurrency.
- **Identified Gap & Resolution:**
  - *Gap:* Python's async event loop handles request concurrency differently than standard Java thread pools.
  - *Resolution:* Utilizing Java Virtual Threads eliminates the need for reactive programming (WebFlux) while achieving equal or superior I/O throughput on database and file operations.

---

### 2.2 Data Validation & Serialization

- **Existing Python Architecture:**
  - Tool: Pydantic v2 (`BaseModel`, `Field`, `model_validator`, `field_validator`).
  - Validation: Automatic request body parsing, runtime coercion, and standardized `422 Unprocessable Entity` error arrays.
- **Target Java Architecture:**
  - Tool: Jakarta Bean Validation (`@Valid`, `@NotNull`, `@Size`, `@Min`, `@Max`, `@Pattern`) + Jackson JSON parser.
- **Identified Gap & Resolution:**
  - *Gap:* Pydantic's default error response format (`detail: [{"loc": ["body", "field"], "msg": "..."}]`) is consumed by React's `apiClient.ts` error extractor ([`src/services/apiClient.ts`](file:///C:/Users/GANESH%20VALLABH%20M/.gemini/antigravity/scratch/companyaudit-platform/src/services/apiClient.ts#L47-L68)).
  - *Resolution:* Implement a custom `@RestControllerAdvice` in Spring Boot that maps `MethodArgumentNotValidException` to the identical Pydantic-shaped JSON error array:
    ```json
    {
      "detail": [
        {
          "loc": ["body", "field_name"],
          "msg": "must not be blank",
          "type": "value_error"
        }
      ]
    }
    ```

---

### 2.3 Object-Relational Mapping (ORM) & Database Connectivity

- **Existing Python Architecture:**
  - Tool: SQLAlchemy 2.0 (`DeclarativeBase`, `Mapped`, `mapped_column`) with `psycopg` v3 binary driver.
  - Migrations: Alembic tracking revisions `d72d5d8ca631` and `9a553dc0bf47`.
  - Database Features Used: Native UUID primary keys, JSONB columns (`regulatory_scope`, `affected_assets`, `changes_json`), Generated Column (`risks.inherent_score`), composite unique constraints, and check constraints.
- **Target Java Architecture:**
  - Tool: Spring Data JPA + Hibernate 6.6.x + PostgreSQL JDBC driver + HikariCP connection pool.
  - Migrations: Flyway managing SQL migrations.
- **Identified Gaps & Resolutions:**
  - *Gap 1 (Schema Mutation Risk):* Hibernate defaults can accidentally drop or modify columns if `ddl-auto=update` is used.
    *Resolution:* Enforce `spring.jpa.hibernate.ddl-auto=validate`. Hibernate is strictly read-only regarding schema structure.
  - *Gap 2 (Generated Column):* In table `risks`, column `inherent_score` is defined as `SMALLINT GENERATED ALWAYS AS (probability * impact) STORED`.
    *Resolution:* In `RiskEntity`, annotate the field with `@Generated` and `@Column(name = "inherent_score", insertable = false, updatable = false)`.
  - *Gap 3 (JSONB Mapping):* SQLAlchemy uses `postgresql.JSONB`.
    *Resolution:* Use Hibernate 6's native `@JdbcTypeCode(SqlTypes.JSON)` annotation on `List<String>`, `List<Map<String, Object>>`, and `Map<String, Object>` fields.

---

### 2.4 Security & Cryptographic Parity

- **Existing Python Architecture:**
  - Argon2id: `pwdlib.PasswordHash` using `Argon2Hasher(time_cost=3, memory_cost=65536, parallelism=4)`.
  - JWT: `PyJWT` signing HS256 tokens carrying `sub`, `cid`, `role`, `ver`, `type`, `jti`, `fam`.
  - Session Rotation: In-database `refresh_sessions` with SHA-256 token hashing and token-family theft detection.
  - CSRF: Double-submit cookie pattern (`companyaudit_csrf` cookie + `X-CSRF-Token` header).
  - Row Isolation: `company_id` enforcement and `ensure_department_scope()` for Department Heads.
- **Target Java Architecture:**
  - Argon2id: Spring Security `Argon2PasswordEncoder(16, 32, 4, 65536, 3)` via Bouncy Castle.
  - JWT: JJWT 0.12.x HS256 signing with `ApplicationProperties.jwtSecretKey`.
  - CSRF: Custom `DoubleSubmitCsrfFilter` matching `companyaudit_csrf` against `X-CSRF-Token`.
- **Identified Gaps & Resolutions:**
  - *Gap:* Any discrepancy in Argon2id parameters will prevent existing users from logging in with their current credentials.
  - *Resolution:* Automated parity tests verify that the Java password encoder successfully authenticates test credentials created in Python.

---

### 2.5 Audit History Hash-Chaining Ledger

- **Existing Python Architecture:**
  - Implemented in `backend/app/services/audit_history.py`.
  - Serializes event payload to canonical JSON using `json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str)`.
  - Hashes UTF-8 bytes with SHA-256 and links to `prev_event_sha256`.
- **Target Java Architecture:**
  - `AuditHashCalculator` utility in `io.companyaudit.platform.util`.
- **Identified Gap & Resolution:**
  - *Gap:* Jackson's default serialization inserts spaces after colons/commas and orders keys arbitrarily, which breaks the SHA-256 hash chain.
  - *Resolution:* Implement a deeply sorted `TreeMap` mapper and disable pretty-printing. An automated test (`AuditHashParityTest`) asserts byte-for-byte SHA-256 parity with Python output.

---

### 2.6 Predictive Analytics & AI Integration

- **Existing Python Architecture:**
  - Predictive Analytics: Scikit-learn OLS `LinearRegression().fit(x, y)` in `backend/app/analytics/forecasting.py`. Calculates slope, intercept, $R^2$, and multi-month projected target dates.
  - Grounded AI: Multi-provider external LLM gateway (`OpenAI`, `Anthropic`, `Gemini`) in `backend/app/analytics/reporting.py`.
- **Target Java Architecture:**
  - Python AI Sidecar microservice running on internal port 5000.
  - Spring Boot `AnalyticsIntegrationService` communicating over internal HTTP.
- **Identified Gap & Resolution:**
  - *Gap:* Porting Scikit-learn's exact regression math, Pandas DataFrame operations, and NumPy vector manipulation to pure Java introduces high risk of subtle numeric drift.
  - *Resolution:* Preserve the existing Python analytics logic as a lightweight internal microservice container. Spring Boot delegates forecasting queries to this sidecar.

---

### 2.7 Document Reporting (Excel, PDF, CSV)

- **Existing Python Architecture:**
  - Excel: `openpyxl` creating multi-tab `.xlsx` workbooks with cell fills and borders.
  - PDF: `fpdf2` creating landscape A4 corporate audit decks.
  - CSV: Standard Python `csv.writer`.
- **Target Java Architecture:**
  - Excel: Apache POI `poi-ooxml` (v5.3.x).
  - PDF: OpenPDF / LibrePDF (v2.0.x).
  - CSV: Apache Commons CSV (v1.11.x).
- **Identified Gap & Resolution:**
  - *Gap:* Visual formatting, column widths, font sizes, and header colors must match the existing export files.
  - *Resolution:* Define standardized POI styles matching the corporate navy palette (`#0B1F3A`) and table dimensions.
