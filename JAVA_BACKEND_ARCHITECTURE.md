# Java Spring Boot Backend Architecture Design
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Target Runtime:** Java 21 LTS | Spring Boot 3.4.x | Spring Security 6 | Spring Data JPA (Hibernate 6)  
**Database:** PostgreSQL 16 (Existing Schema Retained)  
**Document Classification:** Enterprise Architecture Blueprint & Technical Specification  

---

## 1. Executive & Architectural Overview

This document specifies the target enterprise Java backend architecture designed to replace the current Python 3.13 / FastAPI service with full contract, functional, and security parity. 

### 1.1 Architectural Objectives
- **Zero Frontend Disruption:** The React 19 / TypeScript client must interact with the Java backend without changing any endpoint paths, JSON formats, headers, or cookie contracts.
- **Zero Database Disruption:** The existing PostgreSQL 16 relational database (22 tables, UUID keys, JSONB, check constraints, foreign keys) is preserved 100% without structural mutation or data loss.
- **Strict Security & Cryptographic Parity:** Complete preservation of Argon2id password hashing, in-database refresh-token rotation with family-based theft detection, double-submit CSRF protection, multi-tenant row isolation, 5-role RBAC, SHA-256 evidence integrity locking, and append-only audit log hash chaining.
- **High Concurrency & Modern Standards:** Built on Java 21 LTS virtual threads (Project Loom) and Spring Boot 3.4 for maximum I/O throughput on database and file operations.

---

## 2. High-Level System Architecture

```mermaid
graph TD
    Client["React 19 Enterprise Client (Browser)<br/>TypeScript | Tailwind CSS | Recharts | Context API"]
    
    subgraph Reverse Proxy & Gateway Tier
        Nginx["Nginx 1.27 Reverse Proxy & Static Host<br/>- Serves React SPA Content-Hashed Bundles (/assets/*)<br/>- Enforces client_max_body_size 28M & Security Headers<br/>- Proxies /api/* to Spring Boot Backend"]
    end

    subgraph Application Tier: Spring Boot 3.4 (Java 21 LTS)
        Security["Spring Security 6 Filter Chain<br/>- OncePerRequestFilter (Bearer JWT)<br/>- CSRF Double-Submit Validator<br/>- Rate Limiting Filter (Bucket4j)"]
        
        Controllers["REST API Controllers (@RestController)<br/>- Auth, Audits, Company, Governance, Evidence, Dashboard"]
        
        Services["Business Service Layer (@Service, @Transactional)<br/>- AuthService, AuditScoringService, EvidenceStorageService<br/>- AuditHistoryHashService, SlaSchedulerService, ReportingService"]
        
        Repositories["Spring Data JPA Repositories (@Repository)<br/>- Multi-tenant tenant_id queries, HikariCP Connection Pool"]
        
        StorageEngine["Evidence Vault Disk Service<br/>- Apache Tika (Magic Bytes)<br/>- SHA-256 Checksum Engine<br/>- Out-of-webroot Disk I/O"]
        
        ReportEngine["Reporting Engines<br/>- Apache POI (Excel .xlsx)<br/>- OpenPDF (Landscape A4 PDF)<br/>- Apache Commons CSV"]
    end

    subgraph Optional AI / ML Microservice Sidecar
        PySidecar["Python FastAPI AI Sidecar (:5000)<br/>- Scikit-learn OLS LinearRegression<br/>- NumPy / Pandas Metrics Aggregations<br/>- LLM Prompt Orchestration"]
    end

    subgraph Persistence & Infrastructure Tier
        Postgres[("PostgreSQL 16 Database<br/>- 22 Relational Tables (UUIDs, JSONB, Constraints)<br/>- Flyway Migration Baseline (V1, V2)")]
        Volume[("Persistent Storage Volume<br/>/var/lib/companyaudit/evidence")]
    end

    Client -->|HTTPS Traffic| Nginx
    Nginx -->|Static Assets| Client
    Nginx -->|/api/* HTTP Reverse Proxy| Security
    Security --> Controllers
    Controllers --> Services
    Services --> Repositories
    Services --> StorageEngine
    Services --> ReportEngine
    Services -.->|Internal HTTP/JSON| PySidecar
    Repositories -->|JDBC / HikariCP| Postgres
    StorageEngine -->|Java NIO File Channel| Volume
```

---

## 3. Technology Stack & Dependency Inventory

### 3.1 Technology Matrix

| Component | Technology | Version | Rationale |
| :--- | :--- | :--- | :--- |
| **Language** | Java | 21 LTS (Temurin / GraalVM) | Long-Term Support, Virtual Threads (Project Loom), Records, Pattern Matching. |
| **Framework** | Spring Boot | 3.4.x | Cloud-native Java framework, mature ecosystem, automated observability. |
| **Security** | Spring Security | 6.4.x | Standardized enterprise filter chains, method security (`@PreAuthorize`). |
| **Data Access** | Spring Data JPA / Hibernate | 6.6.x | Mature ORM, native support for PostgreSQL UUID, JSONB, and generated columns. |
| **Connection Pool** | HikariCP | 5.1.x | Industry standard high-performance JDBC connection pool. |
| **Database Migrations**| Flyway | 10.x | Version-controlled repeatable SQL migrations matching existing Alembic revisions. |
| **Token Handling** | JJWT (`jjwt-api`, `jjwt-impl`) | 0.12.x | High-performance RFC 7519 JWT generation and HS256 verification. |
| **Password Hashing**| Bouncy Castle + Spring Security | 1.78+ | Native Argon2id implementation (`Argon2PasswordEncoder`). |
| **Validation** | Jakarta Bean Validation / Hibernate Validator | 8.0.x | Strict declarative schema constraints (`@NotNull`, `@Size`, `@Min`, `@Max`). |
| **File MIME / Magic**| Apache Tika Core | 2.9.x | File signature and magic-byte inspection for Evidence Vault uploads. |
| **Excel Generation**| Apache POI (`poi-ooxml`) | 5.3.x | Programmatic multi-tab Excel creation with styling, fonts, and numeric formats. |
| **PDF Generation** | OpenPDF / LibrePDF | 2.0.x | Open-source LGPL PDF generation for landscape fiduciary audit packages. |
| **CSV Utilities** | Apache Commons CSV | 1.11.x | RFC 4180 compliant CSV serialization. |
| **Logging** | Logback + Logstash Logback Encoder | 8.0.x | Machine-readable structured JSON logging with MDC tracing. |
| **Rate Limiting** | Bucket4j (`bucket4j-core`) | 8.10.x | Thread-safe in-memory sliding-window token-bucket rate limiter. |

### 3.2 Canonical `pom.xml` Dependency Declaration

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.4.0</version>
        <relativePath/>
    </parent>
    
    <groupId>io.companyaudit</groupId>
    <artifactId>companyaudit-platform-api</artifactId>
    <version>2.0.0</version>
    <name>companyaudit-platform-api</name>
    <description>Enterprise Audit &amp; Performance Analytics Platform API</description>

    <properties>
        <java.version>21</java.version>
        <jjwt.version>0.12.6</jjwt.version>
        <bouncycastle.version>1.78.1</bouncycastle.version>
        <apache-tika.version>2.9.2</apache-tika.version>
        <poi.version>5.3.0</poi.version>
        <openpdf.version>2.0.3</openpdf.version>
        <commons-csv.version>1.11.2</commons-csv.version>
        <bucket4j.version>8.10.1</bucket4j.version>
        <logstash-logback.version>8.0</logstash-logback.version>
    </properties>

    <dependencies>
        <!-- Spring Boot Starters -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>

        <!-- PostgreSQL & Migrations -->
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-core</artifactId>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-database-postgresql</artifactId>
        </dependency>

        <!-- JWT Token Operations (JJWT) -->
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-api</artifactId>
            <version>${jjwt.version}</version>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-impl</artifactId>
            <version>${jjwt.version}</version>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-jackson</artifactId>
            <version>${jjwt.version}</version>
            <scope>runtime</scope>
        </dependency>

        <!-- Cryptography: Argon2id via BouncyCastle -->
        <dependency>
            <groupId>org.bouncycastle</groupId>
            <artifactId>bcprov-jdk18on</artifactId>
            <version>${bouncycastle.version}</version>
        </dependency>

        <!-- File Inspection & Magic Bytes -->
        <dependency>
            <groupId>org.apache.tika</groupId>
            <artifactId>tika-core</artifactId>
            <version>${apache-tika.version}</version>
        </dependency>

        <!-- Reporting: Excel (POI), PDF (OpenPDF), CSV -->
        <dependency>
            <groupId>org.apache.poi</groupId>
            <artifactId>poi-ooxml</artifactId>
            <version>${poi.version}</version>
        </dependency>
        <dependency>
            <groupId>com.github.librepdf</groupId>
            <artifactId>openpdf</artifactId>
            <version>${openpdf.version}</version>
        </dependency>
        <dependency>
            <groupId>org.apache.commons</groupId>
            <artifactId>commons-csv</artifactId>
            <version>${commons-csv.version}</version>
        </dependency>

        <!-- Rate Limiting -->
        <dependency>
            <groupId>com.bucket4j</groupId>
            <artifactId>bucket4j-core</artifactId>
            <version>${bucket4j.version}</version>
        </dependency>

        <!-- Structured Logging -->
        <dependency>
            <groupId>net.logstash.logback</groupId>
            <artifactId>logstash-logback-encoder</artifactId>
            <version>${logstash-logback.version}</version>
        </dependency>

        <!-- Lombok (Developer Productivity) -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- Testing -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.security</groupId>
            <artifactId>spring-security-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

---

## 4. Package Structure & Modular Design

```
io.companyaudit.platform/
├── CompanyAuditApplication.java             # Entry point with Virtual Threads enabled
├── common/
│   ├── constants/                           # App constants, role literals, domain literals
│   ├── exception/                           # Custom domain exceptions (EntityNotFound, BusinessViolation)
│   ├── response/                            # Standard envelope records (MessageResponse, PaginatedResponse)
│   └── util/                                # SecurityUtils, CanonicalJsonUtils, InitialsGenerator
├── config/
│   ├── ApplicationProperties.java           # @ConfigurationProperties binding app.*
│   ├── FlywayConfig.java                    # Flyway baseline configuration
│   ├── JacksonConfig.java                   # Canonical JSON formatting & JSR310 modules
│   ├── RateLimitConfig.java                 # Bucket4j cache & sliding window limiter
│   ├── SecurityConfig.java                  # SecurityFilterChain, CORS, Argon2 bean
│   └── WebMvcConfig.java                    # Interceptors, Request-ID tracing, argument resolvers
├── domain/                                  # JPA Entities (22 tables)
│   ├── audit/                               # AuditEntity, AuditScopeEntity, ChecklistEntity, etc.
│   ├── core/                                # CompanyEntity, DepartmentEntity, UserEntity, RefreshSessionEntity
│   ├── governance/                          # FindingEntity, RiskEntity, RecommendationEntity, CorrectiveActionEntity, EvidenceEntity
│   └── telemetry/                           # NotificationEntity, AuditHistoryEntity
├── dto/                                     # Immutable Java Records mirroring TypeScript api.ts
│   ├── request/                             # LoginRequest, RegisterUserRequest, AuditCreateRequest, etc.
│   └── response/                            # TokenResponse, UserSummary, AuditOut, DashboardOverviewOut, etc.
├── repository/                              # Spring Data JPA interfaces
│   ├── AuditRepository.java
│   ├── UserRepository.java
│   ├── RefreshSessionRepository.java
│   └── ...
├── security/                                # Core Security Engine
│   ├── Argon2PasswordEncoderProvider.java   # Exact parameter match (t=3, m=64MB, p=4)
│   ├── CustomUserPrincipal.java             # Authenticated user representation (UUID, CID, Role, Version)
│   ├── JwtAuthenticationFilter.java         # OncePerRequestFilter parsing Bearer header
│   ├── JwtTokenProvider.java                # Access & Refresh token minting/decoding
│   └── SecurityAuditorAware.java            # Spring Security context auditor propagation
└── service/                                 # Business Logic & Transactions
    ├── AuthService.java                     # Login, token rotation, theft detection, password resets
    ├── AuditManagementService.java          # Audit lifecycle, status validation, scopes
    ├── AuditScoringService.java             # Weighted compliance formula recalculation
    ├── EvidenceVaultService.java            # Multipart I/O, Tika magic bytes, SHA-256 locks
    ├── AuditHistoryLedgerService.java       # Cryptographic hash-chain calculation & verify
    ├── SlaAutomationService.java            # Periodic SLA sweep & notification dispatch
    ├── ReportGenerationService.java         # Apache POI (.xlsx), OpenPDF (.pdf), CSV
    └── AnalyticsIntegrationService.java     # Python Sidecar bridge or native OLS regression
```

---

## 5. Core Architectural Patterns

### 5.1 Concurrency with Java 21 Virtual Threads
Spring Boot 3.4 natively supports Java 21 virtual threads. Enabling virtual threads allows the application to handle high volumes of concurrent I/O operations (such as large evidence file streaming and PDF/Excel generation) without thread pool exhaustion:

```yaml
spring:
  threads:
    virtual:
      enabled: true
```

### 5.2 Multi-Tenant Data Isolation Strategy
Every entity in the database belongs to an enterprise tenant via `company_id: UUID`. In Spring Boot, isolation is guaranteed through three cooperative mechanisms:
1. **Repository-Level Parameterization:** All Spring Data JPA query methods require `companyId`:
   ```java
   Optional<AuditEntity> findByIdAndCompanyId(UUID id, UUID companyId);
   ```
2. **Security Principal Context:** The authenticated `CustomUserPrincipal` extracts `companyId` directly from the validated JWT claims (`cid`). Controllers pass this trusted context to services.
3. **Cross-Tenant Guard Assertions:** Services assert entity ownership, throwing `EntityNotFoundException` (yielding HTTP 404) on cross-tenant ID probes to prevent tenant enumeration attacks.

### 5.3 Exception Handling & RFC 7807 / FastAPI Error Parity
The FastAPI backend returns errors in the format `{"detail": "..."}` or `{"detail": "...", "error_ref": "..."}`. To prevent breaking frontend error parsers ([`src/services/apiClient.ts`](file:///C:/Users/GANESH%20VALLABH%20M/.gemini/antigravity/scratch/companyaudit-platform/src/services/apiClient.ts#L47-L68)), the Spring Boot `@RestControllerAdvice` formats all errors identically:

```java
public record ApiErrorResponse(String detail, String errorRef) {}
```

---

## 6. Logging, Diagnostics & Tracing

### 6.1 Structured JSON Logging
Production logs are rendered directly to `stdout` in JSON format using Logstash Logback Encoder:

```json
{
  "timestamp": "2026-12-01T10:15:30.123Z",
  "level": "INFO",
  "logger": "io.companyaudit.platform.controller.AuditController",
  "message": "http_request",
  "request_id": "8f9a2e4b-7c1d-4e9f-8a2b-3c4d5e6f7a8b",
  "method": "POST",
  "path": "/api/audits/b3e2a100-3485-408a-8be2-7f287950c4bb/responses",
  "status_code": 200,
  "latency_ms": 24.5,
  "company_id": "c1f7274b-5136-4c40-bbd9-95a94a2ee6f8"
}
```

### 6.2 Sensitive Data Redaction
A custom Logback composite converter (`RedactingMessageConverter`) applies regular expressions to mask passwords, authorization headers, and API keys before outputting log records.
