# Phase 4 Database Validation Report: PostgreSQL 16 Schema & JPA Mapping
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Target Architecture:** Java 17 LTS / Spring Boot 3.4.0 / Hibernate 6  
**Database:** PostgreSQL 16 (Preserved from Python/FastAPI backend)  
**Validation Strategy:** `spring.jpa.hibernate.ddl-auto=validate`  
**Status:** SCHEMA VALIDATED & ZERO MUTATIONS CONFIRMED  
**Date:** 2026-11-21  

---

## 1. Executive Summary

This report documents the PostgreSQL 16 database schema validation and Hibernate JPA entity mapping verification for **Phase 4: Governance, Findings, Corrective Actions (CAPA), Risk Management, and Evidence Vault**.

The migration strictly enforces zero schema modification:
1. **Zero Database DDL Execution:** No tables, columns, indexes, foreign keys, or constraints were altered, dropped, or recreated.
2. **Strict Hibernate Validation:** Spring Boot is configured with `spring.jpa.hibernate.ddl-auto=validate`. Hibernate verifies at application startup that every JPA entity, column name, SQL data type, precision, nullability, and primary key mapping matches the live PostgreSQL catalog exactly.
3. **Coexistence with Alembic:** The Alembic migration revision history (`alembic_version`) remains intact and authoritative. Flyway remains in passive/baseline coexistence without interfering with Python schema definitions.

All Phase 4 entities (`FindingEntity`, `RecommendationEntity`, `CorrectiveActionEntity`, `RiskEntity`, `EvidenceEntity`, and `AuditHistoryEntity`) have been mapped, verified, and validated against the PostgreSQL schema.

---

## 2. Table-by-Table Schema Inspection & JPA Mapping

### 2.1 Table: `findings`
Maps to `FindingEntity.java` (`@Table(name = "findings")`).

| PostgreSQL Column | PostgreSQL Type | Nullable | Default | JPA Attribute | JPA Annotation & Mapping Details |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | `id` | `@Id`, `@GeneratedValue` |
| `company_id` | `UUID` | No | - | `companyId` | `@Column(name = "company_id", nullable = false)` |
| `audit_id` | `UUID` | Yes | - | `auditId` | `@Column(name = "audit_id")` |
| `department_id` | `UUID` | Yes | - | `departmentId` | `@Column(name = "department_id")` |
| `assignee_id` | `UUID` | Yes | - | `assigneeId` | `@Column(name = "assignee_id")` |
| `code` | `VARCHAR(32)` | No | - | `code` | `@Column(nullable = false, length = 32)` |
| `title` | `VARCHAR(255)` | No | - | `title` | `@Column(nullable = false, length = 255)` |
| `description` | `TEXT` | Yes | - | `description` | `@Column(columnDefinition = "TEXT")` |
| `severity` | `VARCHAR(32)` | No | `'Medium'` | `severity` | `@Column(nullable = false, length = 32)` |
| `category` | `VARCHAR(64)` | Yes | `'Operational'`| `category` | `@Column(length = 64)` |
| `status` | `VARCHAR(32)` | No | `'Open'` | `status` | `@Column(nullable = false, length = 32)` |
| `discovery_date` | `DATE` | Yes | - | `discoveryDate` | `@Column(name = "discovery_date")` |
| `sla_target_date`| `DATE` | Yes | - | `slaTargetDate` | `@Column(name = "sla_target_date")` |
| `closure_notes` | `TEXT` | Yes | - | `closureNotes` | `@Column(name = "closure_notes", columnDefinition = "TEXT")` |
| `closed_at` | `TIMESTAMPTZ` | Yes | - | `closedAt` | `@Column(name = "closed_at")` |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | `createdAt` | `@Column(name = "created_at", nullable = false)` |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | `updatedAt` | `@Column(name = "updated_at", nullable = false)` |

- **Foreign Keys:**
  - `fk_findings_company`: `company_id` $\rightarrow$ `companies(id)` `ON DELETE CASCADE`
  - `fk_findings_audit`: `audit_id` $\rightarrow$ `audits(id)` `ON DELETE SET NULL`
  - `fk_findings_department`: `department_id` $\rightarrow$ `departments(id)` `ON DELETE SET NULL`
  - `fk_findings_assignee`: `assignee_id` $\rightarrow$ `users(id)` `ON DELETE SET NULL`
- **JPA Relationships:**
  - `@OneToMany(mappedBy = "finding")` $\rightarrow$ `List<RecommendationEntity> recommendations`
  - `@OneToMany(mappedBy = "finding")` $\rightarrow$ `List<CorrectiveActionEntity> correctiveActions`
  - `@OneToMany(mappedBy = "finding")` $\rightarrow$ `List<EvidenceEntity> evidenceItems`

---

### 2.2 Table: `recommendations`
Maps to `RecommendationEntity.java` (`@Table(name = "recommendations")`).

| PostgreSQL Column | PostgreSQL Type | Nullable | Default | JPA Attribute | JPA Annotation & Mapping Details |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | `id` | `@Id`, `@GeneratedValue` |
| `finding_id` | `UUID` | No | - | `findingId` | `@Column(name = "finding_id", nullable = false)` |
| `title` | `VARCHAR(255)` | No | - | `title` | `@Column(nullable = false, length = 255)` |
| `description` | `TEXT` | Yes | - | `description` | `@Column(columnDefinition = "TEXT")` |
| `priority` | `VARCHAR(32)` | Yes | `'Medium'` | `priority` | `@Column(length = 32)` |
| `management_response` | `TEXT` | Yes | - | `managementResponse` | `@Column(name = "management_response", columnDefinition = "TEXT")` |
| `responded_by_user_id`| `UUID` | Yes | - | `respondedByUserId` | `@Column(name = "responded_by_user_id")` |
| `responded_at` | `TIMESTAMPTZ` | Yes | - | `respondedAt` | `@Column(name = "responded_at")` |
| `status` | `VARCHAR(32)` | Yes | `'Proposed'` | `status` | `@Column(length = 32)` |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | `createdAt` | `@Column(name = "created_at", nullable = false)` |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | `updatedAt` | `@Column(name = "updated_at", nullable = false)` |

- **Foreign Keys:**
  - `fk_recommendations_finding`: `finding_id` $\rightarrow$ `findings(id)` `ON DELETE CASCADE`
  - `fk_recommendations_responded_by`: `responded_by_user_id` $\rightarrow$ `users(id)` `ON DELETE SET NULL`
- **JPA Relationships:**
  - `@ManyToOne(fetch = FetchType.LAZY)` $\rightarrow$ `FindingEntity finding`

---

### 2.3 Table: `corrective_actions`
Maps to `CorrectiveActionEntity.java` (`@Table(name = "corrective_actions")`).

| PostgreSQL Column | PostgreSQL Type | Nullable | Default | JPA Attribute | JPA Annotation & Mapping Details |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | `id` | `@Id`, `@GeneratedValue` |
| `company_id` | `UUID` | No | - | `companyId` | `@Column(name = "company_id", nullable = false)` |
| `finding_id` | `UUID` | Yes | - | `findingId` | `@Column(name = "finding_id")` |
| `risk_id` | `UUID` | Yes | - | `riskId` | `@Column(name = "risk_id")` |
| `owner_id` | `UUID` | Yes | - | `ownerId` | `@Column(name = "owner_id")` |
| `verified_by_user_id`| `UUID` | Yes | - | `verifiedByUserId` | `@Column(name = "verified_by_user_id")` |
| `code` | `VARCHAR(32)` | No | - | `code` | `@Column(nullable = false, length = 32)` |
| `title` | `VARCHAR(255)` | No | - | `title` | `@Column(nullable = false, length = 255)` |
| `description` | `TEXT` | Yes | - | `description` | `@Column(columnDefinition = "TEXT")` |
| `action_type` | `VARCHAR(64)` | Yes | `'Remediation'` | `actionType` | `@Column(name = "action_type", length = 64)` |
| `status` | `VARCHAR(32)` | Yes | `'Draft'` | `status` | `@Column(length = 32)` |
| `step_number` | `INTEGER` | Yes | `1` | `stepNumber` | `@Column(name = "step_number")` |
| `progress_percent` | `INTEGER` | Yes | `0` | `progressPercent` | `@Column(name = "progress_percent")` |
| `target_date` | `DATE` | Yes | - | `targetDate` | `@Column(name = "target_date")` |
| `completed_at` | `TIMESTAMPTZ` | Yes | - | `completedAt` | `@Column(name = "completed_at")` |
| `verified_at` | `TIMESTAMPTZ` | Yes | - | `verifiedAt` | `@Column(name = "verified_at")` |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | `createdAt` | `@Column(name = "created_at", nullable = false)` |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | `updatedAt` | `@Column(name = "updated_at", nullable = false)` |

- **Foreign Keys:**
  - `fk_actions_company`: `company_id` $\rightarrow$ `companies(id)` `ON DELETE CASCADE`
  - `fk_actions_finding`: `finding_id` $\rightarrow$ `findings(id)` `ON DELETE CASCADE`
  - `fk_actions_risk`: `risk_id` $\rightarrow$ `risks(id)` `ON DELETE CASCADE`
  - `fk_actions_owner`: `owner_id` $\rightarrow$ `users(id)` `ON DELETE SET NULL`
  - `fk_actions_verifier`: `verified_by_user_id` $\rightarrow$ `users(id)` `ON DELETE SET NULL`
- **JPA Relationships:**
  - `@ManyToOne(fetch = FetchType.LAZY)` $\rightarrow$ `FindingEntity finding`
  - `@ManyToOne(fetch = FetchType.LAZY)` $\rightarrow$ `RiskEntity risk`

---

### 2.4 Table: `risks`
Maps to `RiskEntity.java` (`@Table(name = "risks")`).

| PostgreSQL Column | PostgreSQL Type | Nullable | Default | JPA Attribute | JPA Annotation & Mapping Details |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | `id` | `@Id`, `@GeneratedValue` |
| `company_id` | `UUID` | No | - | `companyId` | `@Column(name = "company_id", nullable = false)` |
| `department_id` | `UUID` | Yes | - | `departmentId` | `@Column(name = "department_id")` |
| `owner_id` | `UUID` | Yes | - | `ownerId` | `@Column(name = "owner_id")` |
| `code` | `VARCHAR(32)` | No | - | `code` | `@Column(nullable = false, length = 32)` |
| `title` | `VARCHAR(255)` | No | - | `title` | `@Column(nullable = false, length = 255)` |
| `description` | `TEXT` | Yes | - | `description` | `@Column(columnDefinition = "TEXT")` |
| `category` | `VARCHAR(64)` | Yes | `'Operational'`| `category` | `@Column(length = 64)` |
| `probability` | `INTEGER` | Yes | `3` | `probability` | `@Column(columnDefinition = "INTEGER")` |
| `impact` | `INTEGER` | Yes | `3` | `impact` | `@Column(columnDefinition = "INTEGER")` |
| `inherent_score` | `INTEGER` | Yes | `9` | `inherentScore` | `@Column(name = "inherent_score")` |
| `inherent_severity`| `VARCHAR(32)` | Yes | `'Medium'` | `inherentSeverity` | `@Column(name = "inherent_severity", length = 32)` |
| `residual_probability`| `INTEGER` | Yes | - | `residualProbability` | `@Column(name = "residual_probability")` |
| `residual_impact` | `INTEGER` | Yes | - | `residualImpact` | `@Column(name = "residual_impact")` |
| `residual_score` | `INTEGER` | Yes | - | `residualScore` | `@Column(name = "residual_score")` |
| `status` | `VARCHAR(32)` | Yes | `'Identified'` | `status` | `@Column(length = 32)` |
| `is_escalated` | `BOOLEAN` | Yes | `false` | `isEscalated` | `@Column(name = "is_escalated")` |
| `escalation_notes` | `TEXT` | Yes | - | `escalationNotes` | `@Column(name = "escalation_notes", columnDefinition = "TEXT")` |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | `createdAt` | `@Column(name = "created_at", nullable = false)` |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | `updatedAt` | `@Column(name = "updated_at", nullable = false)` |

- **Foreign Keys:**
  - `fk_risks_company`: `company_id` $\rightarrow$ `companies(id)` `ON DELETE CASCADE`
  - `fk_risks_department`: `department_id` $\rightarrow$ `departments(id)` `ON DELETE SET NULL`
  - `fk_risks_owner`: `owner_id` $\rightarrow$ `users(id)` `ON DELETE SET NULL`
- **JPA Relationships:**
  - `@OneToMany(mappedBy = "risk")` $\rightarrow$ `List<CorrectiveActionEntity> correctiveActions`

---

### 2.5 Table: `evidence`
Maps to `EvidenceEntity.java` (`@Table(name = "evidence")`).

| PostgreSQL Column | PostgreSQL Type | Nullable | Default | JPA Attribute | JPA Annotation & Mapping Details |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | `id` | `@Id`, `@GeneratedValue` |
| `company_id` | `UUID` | No | - | `companyId` | `@Column(name = "company_id", nullable = false)` |
| `audit_id` | `UUID` | Yes | - | `auditId` | `@Column(name = "audit_id")` |
| `finding_id` | `UUID` | Yes | - | `findingId` | `@Column(name = "finding_id")` |
| `uploaded_by_user_id`| `UUID` | Yes | - | `uploadedByUserId` | `@Column(name = "uploaded_by_user_id")` |
| `verified_by_user_id`| `UUID` | Yes | - | `verifiedByUserId` | `@Column(name = "verified_by_user_id")` |
| `file_name` | `VARCHAR(255)` | No | - | `fileName` | `@Column(name = "file_name", nullable = false, length = 255)` |
| `file_size` | `BIGINT` | No | - | `fileSize` | `@Column(name = "file_size", nullable = false)` |
| `mime_type` | `VARCHAR(128)` | No | - | `mimeType` | `@Column(name = "mime_type", nullable = false, length = 128)` |
| `sha256_hash` | `VARCHAR(64)` | No | - | `sha256Hash` | `@Column(name = "sha256_hash", nullable = false, length = 64)` |
| `storage_path` | `VARCHAR(512)` | No | - | `storagePath` | `@Column(name = "storage_path", nullable = false, length = 512)` |
| `classification` | `VARCHAR(64)` | Yes | `'Internal'` | `classification` | `@Column(length = 64)` |
| `retention_years` | `INTEGER` | Yes | `7` | `retentionYears` | `@Column(name = "retention_years")` |
| `is_verified` | `BOOLEAN` | Yes | `false` | `isVerified` | `@Column(name = "is_verified")` |
| `verified_at` | `TIMESTAMPTZ` | Yes | - | `verifiedAt` | `@Column(name = "verified_at")` |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | `createdAt` | `@Column(name = "created_at", nullable = false)` |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | `updatedAt` | `@Column(name = "updated_at", nullable = false)` |

- **Foreign Keys:**
  - `fk_evidence_company`: `company_id` $\rightarrow$ `companies(id)` `ON DELETE CASCADE`
  - `fk_evidence_audit`: `audit_id` $\rightarrow$ `audits(id)` `ON DELETE CASCADE`
  - `fk_evidence_finding`: `finding_id` $\rightarrow$ `findings(id)` `ON DELETE SET NULL`
  - `fk_evidence_uploader`: `uploaded_by_user_id` $\rightarrow$ `users(id)` `ON DELETE SET NULL`
  - `fk_evidence_verifier`: `verified_by_user_id` $\rightarrow$ `users(id)` `ON DELETE SET NULL`
- **JPA Relationships:**
  - `@ManyToOne(fetch = FetchType.LAZY)` $\rightarrow$ `FindingEntity finding`

---

### 2.6 Table: `audit_history`
Maps to `AuditHistoryEntity.java` (`@Table(name = "audit_history")`).

| PostgreSQL Column | PostgreSQL Type | Nullable | Default | JPA Attribute | JPA Annotation & Mapping Details |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | `id` | `@Id`, `@GeneratedValue` |
| `company_id` | `UUID` | No | - | `companyId` | `@Column(name = "company_id", nullable = false)` |
| `audit_id` | `UUID` | Yes | - | `auditId` | `@Column(name = "audit_id")` |
| `event_type` | `VARCHAR(64)` | No | - | `eventType` | `@Column(name = "event_type", nullable = false, length = 64)` |
| `event_payload` | `JSONB` | Yes | `'{}'::jsonb` | `eventPayload` | `@Column(name = "event_payload", columnDefinition = "jsonb")` |
| `previous_hash` | `VARCHAR(64)` | Yes | - | `previousHash` | `@Column(name = "previous_hash", length = 64)` |
| `event_hash` | `VARCHAR(64)` | No | - | `eventHash` | `@Column(name = "event_hash", nullable = false, length = 64)` |
| `actor_user_id` | `UUID` | Yes | - | `actorUserId` | `@Column(name = "actor_user_id")` |
| `actor_role` | `VARCHAR(64)` | Yes | - | `actorRole` | `@Column(name = "actor_role", length = 64)` |
| `timestamp` | `TIMESTAMPTZ` | No | `now()` | `timestamp` | `@Column(nullable = false)` |

- **Foreign Keys:**
  - `fk_history_company`: `company_id` $\rightarrow$ `companies(id)` `ON DELETE CASCADE`
  - `fk_history_audit`: `audit_id` $\rightarrow$ `audits(id)` `ON DELETE CASCADE`
  - `fk_history_actor`: `actor_user_id` $\rightarrow$ `users(id)` `ON DELETE SET NULL`

---

## 3. Database Coexistence & Integrity Guarantees

1. **Alembic Authority Retained:** The `alembic_version` table is unchanged. Python migration scripts (`alembic/versions/*.py`) remain the primary source of truth for database schema modifications until cutover.
2. **Flyway Compatibility:** Flyway is configured with `flyway.baseline-on-migrate=true` and `flyway.baseline-version=0`. Flyway will not execute conflicting DDL migrations against Alembic-managed tables.
3. **Hibernate Validation Mode:**
   ```yaml
   spring:
     jpa:
       hibernate:
         ddl-auto: validate
       open-in-view: false
   ```
   If any discrepancy exists between Java entity annotations and the PostgreSQL catalog, Spring Boot will refuse to start, preventing silent data corruption.
4. **Referential Integrity Constraints:** All foreign keys and cascade rules (`ON DELETE CASCADE`, `ON DELETE SET NULL`) defined in PostgreSQL are fully respected by JPA entity relationships.

---

## 4. Verification Conclusion

All 6 database tables supporting Phase 4 governance and evidence vault functionality have been rigorously verified. There is zero schema deviation between the Python SQLAlchemy models and the Java Spring Data JPA entities.

**Database Validation Status:** **PASSED & CONFIRMED IDENTICAL.**
