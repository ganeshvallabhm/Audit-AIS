# Database Schema & JPA Entity Mapping Specification
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Target Persistence:** Spring Data JPA / Hibernate 6.6.x  
**Database Engine:** PostgreSQL 16 Alpine  
**Preservation Rule:** 100% Database Schema & Data Retention (Zero Schema Mutations)  

---

## 1. Database Architecture & Hibernate Configuration

### 1.1 Production Configuration Posture

To prevent Hibernate from mutating, modifying, or dropping existing production tables, constraints, or indexes, Spring Boot must enforce strict schema validation:

```yaml
spring:
  jpa:
    database: postgresql
    database-platform: org.hibernate.dialect.PostgreSQLDialect
    hibernate:
      ddl-auto: validate   # STRICT: Validates entities match existing schema; NEVER modifies DDL
    show-sql: false
    open-in-view: false    # Prevents OSIV anti-pattern and connection leakage
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

### 1.2 Base Timestamp Superclass

All entities inherit automatic UTC timestamp management matching Python's `TimestampMixin`:

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

## 2. Complete Entity-by-Entity JPA Mappings (22 Tables)

### 2.1 `companies` Table -> `CompanyEntity`

```java
package io.companyaudit.platform.domain.core;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "companies")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CompanyEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "legal_name", nullable = false, length = 255)
    private String legalName;

    @Column(name = "ticker", length = 32)
    private String ticker;

    @Column(name = "headquarters", length = 255)
    private String headquarters;

    @Column(name = "fiscal_year_label", nullable = false, length = 64)
    private String fiscalYearLabel;

    @Column(name = "audit_committee_chair", length = 150)
    private String auditCommitteeChair;

    @Column(name = "external_auditor", length = 150)
    private String externalAuditor;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "regulatory_scope", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<String> regulatoryScope = new ArrayList<>();

    @Column(name = "enterprise_target_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal enterpriseTargetScore;

    @Column(name = "minimum_composite_floor", nullable = false, precision = 5, scale = 2)
    private BigDecimal minimumCompositeFloor;

    @Column(name = "board_risk_threshold", nullable = false)
    private Short boardRiskThreshold;

    @Column(name = "digest_frequency", nullable = false, length = 64)
    private String digestFrequency;

    @Column(name = "sla_auto_escalate", nullable = false)
    private Boolean slaAutoEscalate;

    @Column(name = "ai_citation_strict", nullable = false)
    private Boolean aiCitationStrict;

    @Column(name = "sha_lock_enabled", nullable = false)
    private Boolean shaLockEnabled;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive;

    @OneToMany(mappedBy = "company", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<DepartmentEntity> departments = new ArrayList<>();

    @OneToMany(mappedBy = "company", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<UserEntity> users = new ArrayList<>();
}
```

### 2.2 `departments` Table -> `DepartmentEntity`

```java
package io.companyaudit.platform.domain.core;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "departments", uniqueConstraints = {
    @UniqueConstraint(name = "uq_departments_company_code", columnNames = {"company_id", "code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DepartmentEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "head_user_id")
    private UserEntity headUser;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "target_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal targetScore;

    @Column(name = "scoring_weight", nullable = false, precision = 5, scale = 4)
    private BigDecimal scoringWeight;

    @Column(name = "attention_note", columnDefinition = "text")
    private String attentionNote;
}
```

### 2.3 `users` Table -> `UserEntity`

```java
package io.companyaudit.platform.domain.core;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private DepartmentEntity department;

    @Column(name = "email", nullable = false, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @Column(name = "job_title", length = 120)
    private String jobTitle;

    @Column(name = "role", nullable = false, length = 32)
    private String role; // Admin, Auditor, Department Head, Management, Viewer

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "certifications", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<String> certifications = new ArrayList<>();

    @Column(name = "token_version", nullable = false)
    private Integer tokenVersion;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive;

    @Column(name = "last_login_at")
    private OffsetDateTime lastLoginAt;
}
```

### 2.4 `refresh_sessions` Table -> `RefreshSessionEntity`

```java
package io.companyaudit.platform.domain.core;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "refresh_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefreshSessionEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Column(name = "token_family", nullable = false)
    private UUID tokenFamily;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "revoked_at")
    private OffsetDateTime revokedAt;

    @Column(name = "replaced_by_id")
    private UUID replacedById;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "user_agent", length = 255)
    private String userAgent;
}
```

### 2.5 `audits` Table -> `AuditEntity`

```java
package io.companyaudit.platform.domain.audit;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.DepartmentEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "audits", uniqueConstraints = {
    @UniqueConstraint(name = "uq_audits_company_code", columnNames = {"company_id", "code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "department_id", nullable = false)
    private DepartmentEntity department;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lead_auditor_id")
    private UserEntity leadAuditor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id")
    private UserEntity createdBy;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "domain", nullable = false, length = 32)
    private String domain;

    @Column(name = "framework", nullable = false, length = 150)
    private String framework;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "computed_score", precision = 5, scale = 2)
    private BigDecimal computedScore;

    @Column(name = "scheduled_start")
    private LocalDate scheduledStart;

    @Column(name = "target_due_date")
    private LocalDate targetDueDate;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "summary", columnDefinition = "text")
    private String summary;

    @OneToMany(mappedBy = "audit", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<AuditScopeEntity> scopes = new ArrayList<>();

    @OneToMany(mappedBy = "audit", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<AuditResponseEntity> responses = new ArrayList<>();
}
```

### 2.6 `audit_scopes` Table -> `AuditScopeEntity`

```java
package io.companyaudit.platform.domain.audit;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "audit_scopes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditScopeEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "audit_id", nullable = false)
    private AuditEntity audit;

    @Column(name = "scope_name", nullable = false, length = 180)
    private String scopeName;

    @Column(name = "system_or_process", nullable = false, length = 180)
    private String systemOrProcess;

    @Column(name = "regulatory_clause", length = 120)
    private String regulatoryClause;

    @Column(name = "in_scope", nullable = false)
    private Boolean inScope;
}
```

### 2.7 `checklists` Table -> `ChecklistEntity`

```java
package io.companyaudit.platform.domain.audit;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "checklists", uniqueConstraints = {
    @UniqueConstraint(name = "uq_checklists_company_code", columnNames = {"company_id", "code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChecklistEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "domain", nullable = false, length = 32)
    private String domain;

    @Column(name = "framework", nullable = false, length = 120)
    private String framework;

    @Column(name = "version", nullable = false, length = 24)
    private String version;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive;

    @OneToMany(mappedBy = "checklist", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC")
    @Builder.Default
    private List<ChecklistItemEntity> items = new ArrayList<>();
}
```

### 2.8 `checklist_items` Table -> `ChecklistItemEntity`

```java
package io.companyaudit.platform.domain.audit;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "checklist_items", uniqueConstraints = {
    @UniqueConstraint(name = "uq_checklist_items_code", columnNames = {"checklist_id", "control_code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChecklistItemEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "checklist_id", nullable = false)
    private ChecklistEntity checklist;

    @Column(name = "control_code", nullable = false, length = 40)
    private String controlCode;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "test_procedure", nullable = false, columnDefinition = "text")
    private String testProcedure;

    @Column(name = "weight", nullable = false, precision = 6, scale = 2)
    private BigDecimal weight;

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder;
}
```

### 2.9 `audit_responses` Table -> `AuditResponseEntity`

```java
package io.companyaudit.platform.domain.audit;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "audit_responses", uniqueConstraints = {
    @UniqueConstraint(name = "uq_audit_responses_audit_item", columnNames = {"audit_id", "checklist_item_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditResponseEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "audit_id", nullable = false)
    private AuditEntity audit;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "checklist_item_id", nullable = false)
    private ChecklistItemEntity checklistItem;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "responder_user_id")
    private UserEntity responder;

    @Column(name = "response_value", nullable = false, length = 16)
    private String responseValue; // Pass, Partial, Fail, N/A

    @Column(name = "score_factor", precision = 3, scale = 2)
    private BigDecimal scoreFactor; // 1.00, 0.50, 0.00, null

    @Column(name = "auditor_notes", columnDefinition = "text")
    private String auditorNotes;

    @Column(name = "tested_at", nullable = false)
    private OffsetDateTime testedAt;
}
```

### 2.10 `findings` Table -> `FindingEntity`

```java
package io.companyaudit.platform.domain.governance;

import io.companyaudit.platform.domain.audit.AuditEntity;
import io.companyaudit.platform.domain.audit.AuditResponseEntity;
import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.DepartmentEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "findings", uniqueConstraints = {
    @UniqueConstraint(name = "uq_findings_company_code", columnNames = {"company_id", "code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FindingEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "audit_id", nullable = false)
    private AuditEntity audit;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "audit_response_id")
    private AuditResponseEntity auditResponse;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "department_id", nullable = false)
    private DepartmentEntity department;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_user_id")
    private UserEntity owner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lead_auditor_id")
    private UserEntity leadAuditor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "signed_off_by_id")
    private UserEntity signedOffBy;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "root_cause", nullable = false, columnDefinition = "text")
    private String rootCause;

    @Column(name = "workstream", length = 120)
    private String workstream;

    @Column(name = "severity", nullable = false, length = 16)
    private String severity; // Critical, High, Medium, Low

    @Column(name = "status", nullable = false, length = 32)
    private String status; // Open, In Progress, Verification Pending, Overdue, Closed

    @Column(name = "target_sla_date", nullable = false)
    private LocalDate targetSlaDate;

    @Column(name = "management_response", columnDefinition = "text")
    private String managementResponse;

    @Column(name = "rejection_reason", columnDefinition = "text")
    private String rejectionReason;

    @Column(name = "signed_off_at")
    private OffsetDateTime signedOffAt;

    @OneToMany(mappedBy = "finding", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<RecommendationEntity> recommendations = new ArrayList<>();

    @OneToMany(mappedBy = "finding", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<CorrectiveActionEntity> correctiveActions = new ArrayList<>();
}
```

### 2.11 `recommendations` Table -> `RecommendationEntity`

```java
package io.companyaudit.platform.domain.governance;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "recommendations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecommendationEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "finding_id", nullable = false)
    private FindingEntity finding;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "risk_id")
    private RiskEntity risk;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_user_id")
    private UserEntity author;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "guidance", nullable = false, columnDefinition = "text")
    private String guidance;

    @Column(name = "priority", nullable = false, length = 16)
    private String priority;

    @Column(name = "management_response", columnDefinition = "text")
    private String managementResponse;

    @Column(name = "accepted_by_management", nullable = false)
    private Boolean acceptedByManagement;

    @Column(name = "accepted_at")
    private OffsetDateTime acceptedAt;
}
```

### 2.12 `corrective_actions` Table -> `CorrectiveActionEntity`

```java
package io.companyaudit.platform.domain.governance;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "corrective_actions", uniqueConstraints = {
    @UniqueConstraint(name = "uq_corrective_actions_company_code", columnNames = {"company_id", "code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CorrectiveActionEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "finding_id")
    private FindingEntity finding;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recommendation_id")
    private RecommendationEntity recommendation;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "risk_id")
    private RiskEntity risk;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_to_user_id")
    private UserEntity assignedTo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "verified_by_user_id")
    private UserEntity verifiedBy;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "step_order", nullable = false)
    private Integer stepOrder;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "detail", columnDefinition = "text")
    private String detail;

    @Column(name = "status", nullable = false, length = 24)
    private String status; // Pending, In Progress, Submitted, Verified, Rejected

    @Column(name = "progress_percent", nullable = false)
    private Short progressPercent;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "verified_at")
    private OffsetDateTime verifiedAt;
}
```

### 2.13 `risks` Table -> `RiskEntity` (Handling Generated Column)

```java
package io.companyaudit.platform.domain.governance;

import io.companyaudit.platform.domain.audit.AuditEntity;
import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.DepartmentEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Generated;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "risks", uniqueConstraints = {
    @UniqueConstraint(name = "uq_risks_company_code", columnNames = {"company_id", "code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RiskEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "department_id", nullable = false)
    private DepartmentEntity department;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_user_id")
    private UserEntity owner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_audit_id")
    private AuditEntity linkedAudit;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "scope_description", nullable = false, columnDefinition = "text")
    private String scopeDescription;

    @Column(name = "category", nullable = false, length = 32)
    private String category;

    @Column(name = "probability", nullable = false)
    private Short probability;

    @Column(name = "impact", nullable = false)
    private Short impact;

    // Generated column in PostgreSQL: inherent_score = probability * impact
    @Generated
    @Column(name = "inherent_score", insertable = false, updatable = false)
    private Short inherentScore;

    @Column(name = "severity", nullable = false, length = 16)
    private String severity;

    @Column(name = "residual_probability")
    private Short residualProbability;

    @Column(name = "residual_impact")
    private Short residualImpact;

    @Column(name = "mitigation_strategy", columnDefinition = "text")
    private String mitigationStrategy;

    @Column(name = "narrative", columnDefinition = "text")
    private String narrative;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "affected_assets", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<String> affectedAssets = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "mapped_frameworks", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<Map<String, Object>> mappedFrameworks = new ArrayList<>();

    @Column(name = "escalation_target", length = 120)
    private String escalationTarget;

    @Column(name = "next_review_date")
    private LocalDate nextReviewDate;

    @Column(name = "status", nullable = false, length = 32)
    private String status;
}
```

### 2.14 `evidence` Table -> `EvidenceEntity`

```java
package io.companyaudit.platform.domain.governance;

import io.companyaudit.platform.domain.audit.AuditEntity;
import io.companyaudit.platform.domain.audit.ChecklistItemEntity;
import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "evidence", uniqueConstraints = {
    @UniqueConstraint(name = "uq_evidence_company_code", columnNames = {"company_id", "code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EvidenceEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "audit_id")
    private AuditEntity audit;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "finding_id")
    private FindingEntity finding;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "corrective_action_id")
    private CorrectiveActionEntity correctiveAction;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "checklist_item_id")
    private ChecklistItemEntity checklistItem;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "uploaded_by_user_id", nullable = false)
    private UserEntity uploadedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by_user_id")
    private UserEntity reviewedBy;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(name = "storage_key", nullable = false, unique = true, length = 512)
    private String storageKey;

    @Column(name = "mime_type", nullable = false, length = 120)
    private String mimeType;

    @Column(name = "byte_size", nullable = false)
    private Long byteSize;

    @Column(name = "sha256_hash", nullable = false, length = 64)
    private String sha256Hash;

    @Column(name = "verification_status", nullable = false, length = 24)
    private String verificationStatus; // Pending Review, Verified, Flagged

    @Column(name = "tag", length = 80)
    private String tag;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;
}
```

### 2.15 `distribution_rules` Table -> `DistributionRuleEntity`

```java
package io.companyaudit.platform.domain.governance;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "distribution_rules")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DistributionRuleEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private UserEntity createdBy;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Column(name = "schedule_label", nullable = false, length = 120)
    private String scheduleLabel;

    @Column(name = "recipients", nullable = false, length = 255)
    private String recipients;

    @Column(name = "report_suite_id", nullable = false, length = 64)
    private String reportSuiteId;

    @Column(name = "export_format", nullable = false, length = 16)
    private String exportFormat; // pdf, xlsx, csv

    @Column(name = "icon", nullable = false, length = 16)
    private String icon;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive;

    @Column(name = "last_run_at")
    private OffsetDateTime lastRunAt;
}
```

### 2.16 `notifications` Table -> `NotificationEntity`

```java
package io.companyaudit.platform.domain.telemetry;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "notifications")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "description", nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "severity", nullable = false, length = 16)
    private String severity; // critical, warning, info

    @Column(name = "is_read", nullable = false)
    private Boolean isRead;

    @Column(name = "read_at")
    private OffsetDateTime readAt;

    @Column(name = "entity_type", length = 48)
    private String entityType;

    @Column(name = "entity_id")
    private UUID entityId;

    @Column(name = "target_link", length = 255)
    private String targetLink;

    @Column(name = "dedup_key", length = 160)
    private String dedupKey;
}
```

### 2.17 `audit_history` Table -> `AuditHistoryEntity`

```java
package io.companyaudit.platform.domain.telemetry;

import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "audit_history")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditHistoryEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_user_id")
    private UserEntity actor;

    @Column(name = "actor_label", nullable = false, length = 150)
    private String actorLabel;

    @Column(name = "actor_role", nullable = false, length = 64)
    private String actorRole;

    @Column(name = "category", nullable = false, length = 32)
    private String category;

    @Column(name = "module", nullable = false, length = 64)
    private String module;

    @Column(name = "entity_type", nullable = false, length = 48)
    private String entityType;

    @Column(name = "entity_id", nullable = false)
    private UUID entityId;

    @Column(name = "entity_ref", nullable = false, length = 48)
    private String entityRef;

    @Column(name = "action", nullable = false, columnDefinition = "text")
    private String action;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "changes_json", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> changesJson = new HashMap<>();

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "prev_event_sha256", length = 64)
    private String prevEventSha256;

    @Column(name = "event_sha256", nullable = false, length = 64)
    private String eventSha256;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
```

### 2.18 `projects` Table -> `ProjectEntity`

```java
package io.companyaudit.platform.domain.domains;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.DepartmentEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "projects", uniqueConstraints = {
    @UniqueConstraint(name = "uq_projects_company_code", columnNames = {"company_id", "code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "department_id", nullable = false)
    private DepartmentEntity department;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_user_id")
    private UserEntity manager;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Column(name = "budget_amount", nullable = false, precision = 16, scale = 2)
    private BigDecimal budgetAmount;

    @Column(name = "actual_spend", nullable = false, precision = 16, scale = 2)
    private BigDecimal actualSpend;

    @Column(name = "status", nullable = false, length = 24)
    private String status;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "target_end_date")
    private LocalDate targetEndDate;

    @OneToMany(mappedBy = "project", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ProjectTaskEntity> tasks = new ArrayList<>();
}
```

### 2.19 `project_tasks` Table -> `ProjectTaskEntity`

```java
package io.companyaudit.platform.domain.domains;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "project_tasks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectTaskEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_user_id")
    private UserEntity assignee;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "stage_gate", length = 64)
    private String stageGate;

    @Column(name = "status", nullable = false, length = 24)
    private String status;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "sla_breached", nullable = false)
    private Boolean slaBreached;
}
```

### 2.20 `employees` Table -> `EmployeeEntity`

```java
package io.companyaudit.platform.domain.domains;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.DepartmentEntity;
import io.companyaudit.platform.domain.core.UserEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "employees", uniqueConstraints = {
    @UniqueConstraint(name = "uq_employees_company_code", columnNames = {"company_id", "employee_code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmployeeEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "department_id", nullable = false)
    private DepartmentEntity department;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", unique = true)
    private UserEntity user;

    @Column(name = "employee_code", nullable = false, length = 32)
    private String employeeCode;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @Column(name = "role_title", length = 120)
    private String roleTitle;

    @Column(name = "background_check_verified", nullable = false)
    private Boolean backgroundCheckVerified;

    @Column(name = "security_training_completed", nullable = false)
    private Boolean securityTrainingCompleted;

    @Column(name = "training_completed_at")
    private LocalDate trainingCompletedAt;

    @Column(name = "employment_status", nullable = false, length = 24)
    private String employmentStatus;

    @Column(name = "hired_at")
    private LocalDate hiredAt;
}
```

### 2.21 `customers` Table -> `CustomerEntity`

```java
package io.companyaudit.platform.domain.domains;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "customers", uniqueConstraints = {
    @UniqueConstraint(name = "uq_customers_company_code", columnNames = {"company_id", "account_code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CustomerEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @Column(name = "account_code", nullable = false, length = 32)
    private String accountCode;

    @Column(name = "organization_name", nullable = false, length = 200)
    private String organizationName;

    @Column(name = "region", nullable = false, length = 64)
    private String region;

    @Column(name = "tier", nullable = false, length = 32)
    private String tier;

    @Column(name = "dpa_signed", nullable = false)
    private Boolean dpaSigned;

    @Column(name = "dsar_requests_open", nullable = false)
    private Integer dsarRequestsOpen;

    @Column(name = "sla_compliance_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal slaCompliancePct;

    @Column(name = "satisfaction_score", precision = 4, scale = 2)
    private BigDecimal satisfactionScore;
}
```

### 2.22 `financial_metrics` Table -> `FinancialMetricEntity`

```java
package io.companyaudit.platform.domain.domains;

import io.companyaudit.platform.domain.common.BaseTimestampEntity;
import io.companyaudit.platform.domain.core.CompanyEntity;
import io.companyaudit.platform.domain.core.DepartmentEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "financial_metrics", uniqueConstraints = {
    @UniqueConstraint(name = "uq_fin_metrics_period_code", columnNames = {"company_id", "fiscal_period", "metric_code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FinancialMetricEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private CompanyEntity company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private DepartmentEntity department;

    @Column(name = "fiscal_period", nullable = false, length = 32)
    private String fiscalPeriod;

    @Column(name = "metric_code", nullable = false, length = 40)
    private String metricCode;

    @Column(name = "metric_name", nullable = false, length = 150)
    private String metricName;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "reported_amount", nullable = false, precision = 16, scale = 2)
    private BigDecimal reportedAmount;

    @Column(name = "budget_amount", precision = 16, scale = 2)
    private BigDecimal budgetAmount;

    @Column(name = "variance_pct", precision = 7, scale = 4)
    private BigDecimal variancePct;

    @Column(name = "sox_control_verified", nullable = false)
    private Boolean soxControlVerified;

    @Column(name = "recorded_at", nullable = false)
    private OffsetDateTime recordedAt;
}
```

---

## 3. Flyway Database Migration Strategy

### 3.1 Non-Destructive Baseline Strategy

The target environment already possesses a running PostgreSQL database populated by Alembic revisions:
1. `d72d5d8ca631_initial_schema.py`
2. `9a553dc0bf47_phase4_security_notifications_reporting.py`

When Spring Boot boots with Flyway, it **must not** attempt to rerun `CREATE TABLE` scripts against existing tables. We achieve this using Flyway's **Baseline-on-Migrate** capability:

```yaml
spring:
  flyway:
    enabled: true
    baseline-on-migrate: true       # Baselines existing database if flyway_schema_history is absent
    baseline-version: "2"           # Marks existing Alembic state as Version 2
    baseline-description: "Alembic Phase 4 Baseline"
    locations: classpath:db/migration
```

### 3.2 Flyway Migration Scripts Organization

```
src/main/resources/db/migration/
├── V1__initial_schema.sql                           # Clean SQL translation of Alembic d72d5d8ca631
├── V2__phase4_security_notifications_reporting.sql  # Clean SQL translation of Alembic 9a553dc0bf47
└── V3__future_java_migrations.sql                   # Reserved for future schema modifications
```

- In fresh test environments, Flyway runs `V1` and `V2` sequentially from scratch.
- In production, Flyway detects that tables already exist, establishes `V2` as the baseline without executing SQL, and writes an entry into `flyway_schema_history`.
