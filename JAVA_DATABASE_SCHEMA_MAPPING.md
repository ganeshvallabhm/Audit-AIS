# Database Schema & JPA Entity Mapping Specification
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Target Persistence:** Spring Data JPA / Hibernate 6.6.x  
**Database Engine:** PostgreSQL 16 Alpine  
**Preservation Rule:** 100% Database Schema & Data Retention (Zero Schema Alterations / Drops)  
**Deliverable ID:** PHASE0-DELIV-04

---

## 1. Executive Summary & Schema Retention Guarantees

The CompanyAudit database consists of **22 relational tables** running on PostgreSQL 16 with strict enterprise constraints, foreign keys, multi-tenant composite indexes, JSONB columns, and a cryptographic hash-chain ledger.

### 1.1 Strict Hibernate Invariant
Under no circumstances may Hibernate modify, drop, or recreate database tables in production. The Java Spring Boot backend is strictly configured with:

```yaml
spring:
  jpa:
    database: postgresql
    database-platform: org.hibernate.dialect.PostgreSQLDialect
    hibernate:
      ddl-auto: validate   # STRICT: Halts startup if entity definitions diverge from DB schema
    show-sql: false
    open-in-view: false    # Prevents OSIV connection leaks and lazy-loading during rendering
    properties:
      hibernate:
        format_sql: false
        jdbc:
          batch_size: 50
          order_inserts: true
          order_updates: true
        connection:
          provider_disables_autocommit: true
```

### 1.2 Flyway Migration Governance
Alembic migrations have established the schema at revision `9a553dc0bf47` (V2). Flyway is integrated into Spring Boot with:
- `spring.flyway.baseline-on-migrate: true`
- `spring.flyway.baseline-version: 2`
- `spring.flyway.baseline-description: "Alembic Phase 4 baseline"`
- Baseline scripts `V1__initial_schema.sql` (18 tables) and `V2__phase4_security_notifications_reporting.sql` (4 tables + columns) are located in `backend-java/src/main/resources/db/migration/`.

---

## 2. Type Mapping Compatibility Matrix

| PostgreSQL 16 Column Type | Python SQLAlchemy Type | Java 17 / Jakarta Persistence Type | Hibernate 6 Mapping Annotation |
| :--- | :--- | :--- | :--- |
| `UUID` | `UUID(as_uuid=True)` | `java.util.UUID` | `@Id @GeneratedValue(strategy = GenerationType.UUID)` |
| `VARCHAR(n)` | `String(n)` | `java.lang.String` | `@Column(length = n)` |
| `TEXT` | `Text` | `java.lang.String` | `@Column(columnDefinition = "TEXT")` |
| `BOOLEAN` | `Boolean` | `java.lang.Boolean` / `boolean` | `@Column(nullable = false)` |
| `INTEGER` | `Integer` | `java.lang.Integer` / `int` | `@Column` |
| `BIGINT` | `BigInteger` | `java.lang.Long` / `long` | `@Column` |
| `NUMERIC(p, s)` | `Numeric(p, s)` | `java.math.BigDecimal` | `@Column(precision = p, scale = s)` |
| `TIMESTAMPTZ` | `DateTime(timezone=True)` | `java.time.OffsetDateTime` | `@Column(columnDefinition = "TIMESTAMP WITH TIME ZONE")` |
| `JSONB` | `JSONB` | `JsonNode` / `Map<String, Object>` / Record | `@JdbcTypeCode(SqlTypes.JSON)` |
| `BYTEA` | `LargeBinary` | `byte[]` | `@Column(columnDefinition = "BYTEA")` |
| `VARCHAR` (Enum) | `Enum(..., native_enum=False)` | Java `enum` | `@Enumerated(EnumType.STRING)` |

---

## 3. Base Entities & Audit Infrastructure

### 3.1 Base Timestamp Entity
All 22 entities inherit UTC timestamp management matching Python's `TimestampMixin`:

```java
package io.companyaudit.platform.domain.common;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

@MappedSuperclass
@Getter
@Setter
public abstract class BaseTimestampEntity {

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
```

---

## 4. Complete 22-Table Entity Mapping Inventory

### Table 1: `companies`
- **PK:** `id` (UUID)
- **Columns:** `legal_name` (VARCHAR 255, NOT NULL), `registration_number` (VARCHAR 100, UNIQUE, NOT NULL), `industry` (VARCHAR 100, NOT NULL), `country` (VARCHAR 100, NOT NULL), `risk_score` (NUMERIC 5,2, DEFAULT 0.0), `status` (VARCHAR 50, DEFAULT 'Active'), `is_active` (BOOLEAN, DEFAULT true), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ).
- **JPA Entity:** `CompanyEntity`
- **Relationships:** `@OneToMany` to `DepartmentEntity`, `UserEntity`, `AuditEntity`, `RiskEntity`.

### Table 2: `departments`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE
- **Columns:** `company_id` (UUID, NOT NULL), `name` (VARCHAR 255, NOT NULL), `code` (VARCHAR 50, NOT NULL), `manager_name` (VARCHAR 255), `manager_email` (VARCHAR 255), `is_active` (BOOLEAN, DEFAULT true), `created_at`, `updated_at`.
- **Unique Constraint:** `uq_company_dept_code (company_id, code)`
- **JPA Entity:** `DepartmentEntity`

### Table 3: `users`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE SET NULL, `department_id` -> `departments(id)` ON DELETE SET NULL
- **Columns:** `email` (VARCHAR 255, UNIQUE, NOT NULL), `hashed_password` (VARCHAR 255, NOT NULL), `full_name` (VARCHAR 255, NOT NULL), `role` (VARCHAR 50, NOT NULL), `company_id` (UUID), `department_id` (UUID), `is_active` (BOOLEAN, DEFAULT true), `token_version` (INTEGER, DEFAULT 1), `failed_login_attempts` (INTEGER, DEFAULT 0), `locked_until` (TIMESTAMPTZ), `created_at`, `updated_at`.
- **Indexes:** `ix_users_email`, `ix_users_company_id`, `ix_users_department_id`
- **JPA Entity:** `UserEntity`

### Table 4: `refresh_tokens`
- **PK:** `id` (UUID)
- **FK:** `user_id` -> `users(id)` ON DELETE CASCADE
- **Columns:** `user_id` (UUID, NOT NULL), `token_hash` (VARCHAR 255, UNIQUE, NOT NULL), `family_id` (UUID, NOT NULL), `is_revoked` (BOOLEAN, DEFAULT false), `expires_at` (TIMESTAMPTZ, NOT NULL), `created_at`, `updated_at`.
- **Indexes:** `ix_refresh_tokens_family_id`, `ix_refresh_tokens_token_hash`
- **JPA Entity:** `RefreshTokenEntity`

### Table 5: `audit_templates`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE
- **Columns:** `company_id` (UUID, NOT NULL), `title` (VARCHAR 255, NOT NULL), `description` (TEXT), `framework` (VARCHAR 100, NOT NULL), `version` (VARCHAR 20, DEFAULT '1.0'), `is_published` (BOOLEAN, DEFAULT false), `created_at`, `updated_at`.
- **JPA Entity:** `AuditTemplateEntity`

### Table 6: `audit_template_sections`
- **PK:** `id` (UUID)
- **FK:** `template_id` -> `audit_templates(id)` ON DELETE CASCADE
- **Columns:** `template_id` (UUID, NOT NULL), `title` (VARCHAR 255, NOT NULL), `order_index` (INTEGER, NOT NULL), `weight` (NUMERIC 5,2, DEFAULT 1.0), `created_at`, `updated_at`.
- **JPA Entity:** `AuditTemplateSectionEntity`

### Table 7: `audit_template_items`
- **PK:** `id` (UUID)
- **FK:** `section_id` -> `audit_template_sections(id)` ON DELETE CASCADE
- **Columns:** `section_id` (UUID, NOT NULL), `requirement` (TEXT, NOT NULL), `guidance` (TEXT), `severity` (VARCHAR 50, NOT NULL), `order_index` (INTEGER, NOT NULL), `max_score` (NUMERIC 5,2, DEFAULT 10.0), `created_at`, `updated_at`.
- **JPA Entity:** `AuditTemplateItemEntity`

### Table 8: `audits`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE, `department_id` -> `departments(id)` ON DELETE SET NULL, `template_id` -> `audit_templates(id)` ON DELETE RESTRICT, `lead_auditor_id` -> `users(id)` ON DELETE SET NULL
- **Columns:** `company_id` (UUID, NOT NULL), `department_id` (UUID), `template_id` (UUID, NOT NULL), `lead_auditor_id` (UUID), `title` (VARCHAR 255, NOT NULL), `scope` (TEXT), `status` (VARCHAR 50, NOT NULL, DEFAULT 'Draft'), `start_date` (TIMESTAMPTZ), `end_date` (TIMESTAMPTZ), `total_score` (NUMERIC 5,2), `summary` (TEXT), `created_at`, `updated_at`.
- **Indexes:** `ix_audits_company_id`, `ix_audits_status`, `ix_audits_lead_auditor_id`
- **JPA Entity:** `AuditEntity`

### Table 9: `audit_checklist_answers`
- **PK:** `id` (UUID)
- **FK:** `audit_id` -> `audits(id)` ON DELETE CASCADE, `item_id` -> `audit_template_items(id)` ON DELETE RESTRICT, `auditor_id` -> `users(id)` ON DELETE SET NULL
- **Columns:** `audit_id` (UUID, NOT NULL), `item_id` (UUID, NOT NULL), `auditor_id` (UUID), `compliance_status` (VARCHAR 50, NOT NULL), `score` (NUMERIC 5,2, NOT NULL), `notes` (TEXT), `created_at`, `updated_at`.
- **Unique Constraint:** `uq_audit_item_answer (audit_id, item_id)`
- **JPA Entity:** `AuditChecklistAnswerEntity`

### Table 10: `findings`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE, `audit_id` -> `audits(id)` ON DELETE CASCADE, `department_id` -> `departments(id)` ON DELETE SET NULL, `identified_by_id` -> `users(id)` ON DELETE SET NULL
- **Columns:** `company_id` (UUID, NOT NULL), `audit_id` (UUID, NOT NULL), `department_id` (UUID), `identified_by_id` (UUID), `ref_code` (VARCHAR 50, NOT NULL), `title` (VARCHAR 255, NOT NULL), `description` (TEXT, NOT NULL), `severity` (VARCHAR 50, NOT NULL), `category` (VARCHAR 100, NOT NULL), `status` (VARCHAR 50, NOT NULL, DEFAULT 'Open'), `due_date` (TIMESTAMPTZ), `created_at`, `updated_at`.
- **Indexes:** `ix_findings_company_id`, `ix_findings_audit_id`, `ix_findings_status`, `ix_findings_severity`
- **JPA Entity:** `FindingEntity`

### Table 11: `corrective_actions`
- **PK:** `id` (UUID)
- **FK:** `finding_id` -> `findings(id)` ON DELETE CASCADE, `assigned_to_id` -> `users(id)` ON DELETE SET NULL
- **Columns:** `finding_id` (UUID, NOT NULL), `assigned_to_id` (UUID), `title` (VARCHAR 255, NOT NULL), `description` (TEXT, NOT NULL), `status` (VARCHAR 50, NOT NULL, DEFAULT 'Pending'), `due_date` (TIMESTAMPTZ, NOT NULL), `completed_at` (TIMESTAMPTZ), `resolution_notes` (TEXT), `created_at`, `updated_at`.
- **Indexes:** `ix_corrective_actions_finding_id`, `ix_corrective_actions_status`
- **JPA Entity:** `CorrectiveActionEntity`

### Table 12: `evidences`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE, `audit_id` -> `audits(id)` ON DELETE SET NULL, `finding_id` -> `findings(id)` ON DELETE SET NULL, `uploaded_by_id` -> `users(id)` ON DELETE SET NULL
- **Columns:** `company_id` (UUID, NOT NULL), `audit_id` (UUID), `finding_id` (UUID), `uploaded_by_id` (UUID), `file_name` (VARCHAR 255, NOT NULL), `file_path` (VARCHAR 500, NOT NULL), `file_size` (BIGINT, NOT NULL), `content_type` (VARCHAR 100, NOT NULL), `sha256_hash` (VARCHAR 64, NOT NULL), `description` (TEXT), `created_at`, `updated_at`.
- **Indexes:** `ix_evidences_company_id`, `ix_evidences_sha256`
- **JPA Entity:** `EvidenceEntity`

### Table 13: `audit_history`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE, `actor_user_id` -> `users(id)` ON DELETE SET NULL
- **Columns:** `company_id` (UUID, NOT NULL), `actor_user_id` (UUID), `entity_type` (VARCHAR 100, NOT NULL), `entity_id` (UUID, NOT NULL), `entity_ref` (VARCHAR 100), `module` (VARCHAR 100, NOT NULL), `action` (VARCHAR 255, NOT NULL), `category` (VARCHAR 100, NOT NULL), `changes` (JSONB, NOT NULL, DEFAULT '{}'::jsonb), `prev_event_sha256` (VARCHAR 64), `event_sha256` (VARCHAR 64, NOT NULL), `sha_lock_enabled` (BOOLEAN, NOT NULL, DEFAULT true), `created_at`, `updated_at`.
- **Indexes:** `ix_audit_history_company_id`, `ix_audit_history_entity`, `ix_audit_history_event_sha`
- **JPA Entity:** `AuditHistoryEntity`

### Table 14: `risks`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE, `department_id` -> `departments(id)` ON DELETE SET NULL, `owner_id` -> `users(id)` ON DELETE SET NULL
- **Columns:** `company_id` (UUID, NOT NULL), `department_id` (UUID), `owner_id` (UUID), `title` (VARCHAR 255, NOT NULL), `description` (TEXT, NOT NULL), `category` (VARCHAR 100, NOT NULL), `likelihood` (INTEGER, NOT NULL), `impact` (INTEGER, NOT NULL), `risk_score` (INTEGER, GENERATED ALWAYS AS (likelihood * impact) STORED), `status` (VARCHAR 50, NOT NULL, DEFAULT 'Active'), `mitigation_strategy` (TEXT), `created_at`, `updated_at`.
- **JPA Entity:** `RiskEntity` (Note: `risk_score` marked with `@Generated(GenerationTime.ALWAYS)` or `@Column(insertable=false, updatable=false)`).

### Table 15: `risk_history`
- **PK:** `id` (UUID)
- **FK:** `risk_id` -> `risks(id)` ON DELETE CASCADE, `changed_by_id` -> `users(id)` ON DELETE SET NULL
- **Columns:** `risk_id` (UUID, NOT NULL), `changed_by_id` (UUID), `previous_likelihood` (INTEGER, NOT NULL), `previous_impact` (INTEGER, NOT NULL), `new_likelihood` (INTEGER, NOT NULL), `new_impact` (INTEGER, NOT NULL), `change_reason` (TEXT), `created_at`, `updated_at`.
- **JPA Entity:** `RiskHistoryEntity`

### Table 16: `notifications`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE, `user_id` -> `users(id)` ON DELETE CASCADE
- **Columns:** `company_id` (UUID, NOT NULL), `user_id` (UUID, NOT NULL), `title` (VARCHAR 255, NOT NULL), `message` (TEXT, NOT NULL), `notification_type` (VARCHAR 50, NOT NULL), `is_read` (BOOLEAN, DEFAULT false), `metadata` (JSONB, DEFAULT '{}'::jsonb), `created_at`, `updated_at`.
- **Indexes:** `ix_notifications_user_unread (user_id, is_read)`
- **JPA Entity:** `NotificationEntity`

### Table 17: `notification_templates`
- **PK:** `id` (UUID)
- **Columns:** `code` (VARCHAR 100, UNIQUE, NOT NULL), `title_template` (VARCHAR 255, NOT NULL), `body_template` (TEXT, NOT NULL), `channels` (JSONB, NOT NULL), `created_at`, `updated_at`.
- **JPA Entity:** `NotificationTemplateEntity`

### Table 18: `notification_delivery_logs`
- **PK:** `id` (UUID)
- **FK:** `notification_id` -> `notifications(id)` ON DELETE CASCADE
- **Columns:** `notification_id` (UUID, NOT NULL), `channel` (VARCHAR 50, NOT NULL), `recipient` (VARCHAR 255, NOT NULL), `status` (VARCHAR 50, NOT NULL), `error_message` (TEXT), `created_at`, `updated_at`.
- **JPA Entity:** `NotificationDeliveryLogEntity`

### Table 19: `report_export_jobs`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE, `requested_by_id` -> `users(id)` ON DELETE SET NULL
- **Columns:** `company_id` (UUID, NOT NULL), `requested_by_id` (UUID), `export_format` (VARCHAR 20, NOT NULL), `report_type` (VARCHAR 50, NOT NULL), `status` (VARCHAR 50, NOT NULL, DEFAULT 'Queued'), `filter_params` (JSONB, DEFAULT '{}'::jsonb), `file_path` (VARCHAR 500), `error_detail` (TEXT), `completed_at` (TIMESTAMPTZ), `created_at`, `updated_at`.
- **Indexes:** `ix_export_jobs_company_status (company_id, status)`
- **JPA Entity:** `ReportExportJobEntity`

### Table 20: `sla_policies`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE
- **Columns:** `company_id` (UUID, NOT NULL), `entity_type` (VARCHAR 50, NOT NULL), `severity` (VARCHAR 50, NOT NULL), `resolution_target_hours` (INTEGER, NOT NULL), `escalation_threshold_hours` (INTEGER, NOT NULL), `is_active` (BOOLEAN, DEFAULT true), `created_at`, `updated_at`.
- **Unique Constraint:** `uq_sla_company_entity_sev (company_id, entity_type, severity)`
- **JPA Entity:** `SlaPolicyEntity`

### Table 21: `sla_escalation_logs`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE, `policy_id` -> `sla_policies(id)` ON DELETE CASCADE
- **Columns:** `company_id` (UUID, NOT NULL), `policy_id` (UUID, NOT NULL), `entity_type` (VARCHAR 50, NOT NULL), `entity_id` (UUID, NOT NULL), `entity_ref` (VARCHAR 100), `hours_overdue` (INTEGER, NOT NULL), `escalation_level` (INTEGER, NOT NULL), `escalated_to_email` (VARCHAR 255, NOT NULL), `created_at`, `updated_at`.
- **JPA Entity:** `SlaEscalationLogEntity`

### Table 22: `report_templates`
- **PK:** `id` (UUID)
- **FK:** `company_id` -> `companies(id)` ON DELETE CASCADE
- **Columns:** `company_id` (UUID, NOT NULL), `name` (VARCHAR 255, NOT NULL), `description` (TEXT), `report_type` (VARCHAR 50, NOT NULL), `config` (JSONB, NOT NULL, DEFAULT '{}'::jsonb), `is_default` (BOOLEAN, DEFAULT false), `created_at`, `updated_at`.
- **JPA Entity:** `ReportTemplateEntity`

---

## 5. Generated Columns & Computed Properties

In PostgreSQL 16, table `risks` defines:
```sql
risk_score INTEGER GENERATED ALWAYS AS (likelihood * impact) STORED
```
In Hibernate 6, mapped fields must never be included in `INSERT` or `UPDATE` statements to prevent PostgreSQL `cannot insert into column "risk_score"` errors:

```java
@Column(name = "risk_score", insertable = false, updatable = false)
private Integer riskScore;
```
For in-memory calculations before saving or flushing:
```java
public Integer calculateRiskScore() {
    if (this.likelihood != null && this.impact != null) {
        return this.likelihood * this.impact;
    }
    return 0;
}
```

---

## 6. Multi-Tenant Query Isolation Specification

Every multi-tenant repository query must filter strictly by `company_id` to enforce hard multi-tenant partitioning:

```java
public interface FindingRepository extends JpaRepository<FindingEntity, UUID>, JpaSpecificationExecutor<FindingEntity> {

    @Query("SELECT f FROM FindingEntity f WHERE f.companyId = :companyId AND f.id = :id")
    Optional<FindingEntity> findByCompanyIdAndId(@Param("companyId") UUID companyId, @Param("id") UUID id);

    @Query("SELECT f FROM FindingEntity f WHERE f.companyId = :companyId")
    Page<FindingEntity> findAllByCompanyId(@Param("companyId") UUID companyId, Pageable pageable);

    @Query("SELECT f FROM FindingEntity f WHERE f.companyId = :companyId AND f.departmentId = :departmentId")
    Page<FindingEntity> findAllByCompanyIdAndDepartmentId(@Param("companyId") UUID companyId, @Param("departmentId") UUID departmentId, Pageable pageable);
}
```
For global enforcement, Hibernate 6 filters (`@FilterDef` and `@Filter`) can be bound to the tenant context injected by `SecurityContextHolder`.

---

## 7. Performance & Query Optimization Rules

1. **Lazy Loading by Default:** All `@ManyToOne` and `@OneToOne` associations must be explicitly declared as `fetch = FetchType.LAZY` (overriding Jakarta JPA's default `EAGER`).
2. **N+1 Prevention:** Queries traversing relationships must use `@EntityGraph` or `JOIN FETCH` (e.g. fetching `AuditEntity` along with its `Department` and `LeadAuditor`).
3. **OSIV Disablement:** `spring.jpa.open-in-view: false` ensures Hibernate sessions close at transaction boundaries, preventing delayed SQL execution in serialization filters.
4. **Batch Inserts/Updates:** JDBC batch size is set to `50` with ordered statements for bulk audit responses and history events.
