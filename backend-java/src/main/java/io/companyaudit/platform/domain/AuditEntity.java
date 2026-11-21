package io.companyaudit.platform.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "audits", uniqueConstraints = {
        @UniqueConstraint(name = "uq_audits_company_code", columnNames = {"company_id", "code"})
}, indexes = {
        @Index(name = "ix_audits_company_domain_status", columnList = "company_id, domain, status"),
        @Index(name = "ix_audits_lead", columnList = "company_id, lead_auditor_id")
})
public class AuditEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", insertable = false, updatable = false)
    private CompanyEntity company;

    @Column(name = "department_id", nullable = false)
    private UUID departmentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id", insertable = false, updatable = false)
    private DepartmentEntity department;

    @Column(name = "lead_auditor_id")
    private UUID leadAuditorId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lead_auditor_id", insertable = false, updatable = false)
    private UserEntity leadAuditor;

    @Column(name = "created_by_id")
    private UUID createdById;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id", insertable = false, updatable = false)
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
    private String status = "Draft";

    @Column(name = "computed_score", precision = 5, scale = 2)
    private BigDecimal computedScore;

    @Column(name = "scheduled_start")
    private LocalDate scheduledStart;

    @Column(name = "target_due_date")
    private LocalDate targetDueDate;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;

    @OneToMany(mappedBy = "audit", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<AuditScopeEntity> scopes = new ArrayList<>();

    @OneToMany(mappedBy = "audit", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<AuditResponseEntity> responses = new ArrayList<>();

    public AuditEntity() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public void setCompanyId(UUID companyId) {
        this.companyId = companyId;
    }

    public CompanyEntity getCompany() {
        return company;
    }

    public void setCompany(CompanyEntity company) {
        this.company = company;
    }

    public UUID getDepartmentId() {
        return departmentId;
    }

    public void setDepartmentId(UUID departmentId) {
        this.departmentId = departmentId;
    }

    public DepartmentEntity getDepartment() {
        return department;
    }

    public void setDepartment(DepartmentEntity department) {
        this.department = department;
    }

    public UUID getLeadAuditorId() {
        return leadAuditorId;
    }

    public void setLeadAuditorId(UUID leadAuditorId) {
        this.leadAuditorId = leadAuditorId;
    }

    public UserEntity getLeadAuditor() {
        return leadAuditor;
    }

    public void setLeadAuditor(UserEntity leadAuditor) {
        this.leadAuditor = leadAuditor;
    }

    public UUID getCreatedById() {
        return createdById;
    }

    public void setCreatedById(UUID createdById) {
        this.createdById = createdById;
    }

    public UserEntity getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(UserEntity createdBy) {
        this.createdBy = createdBy;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getFramework() {
        return framework;
    }

    public void setFramework(String framework) {
        this.framework = framework;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public BigDecimal getComputedScore() {
        return computedScore;
    }

    public void setComputedScore(BigDecimal computedScore) {
        this.computedScore = computedScore;
    }

    public LocalDate getScheduledStart() {
        return scheduledStart;
    }

    public void setScheduledStart(LocalDate scheduledStart) {
        this.scheduledStart = scheduledStart;
    }

    public LocalDate getTargetDueDate() {
        return targetDueDate;
    }

    public void setTargetDueDate(LocalDate targetDueDate) {
        this.targetDueDate = targetDueDate;
    }

    public OffsetDateTime getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(OffsetDateTime completedAt) {
        this.completedAt = completedAt;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public List<AuditScopeEntity> getScopes() {
        return scopes;
    }

    public void setScopes(List<AuditScopeEntity> scopes) {
        this.scopes = scopes;
    }

    public List<AuditResponseEntity> getResponses() {
        return responses;
    }

    public void setResponses(List<AuditResponseEntity> responses) {
        this.responses = responses;
    }
}
