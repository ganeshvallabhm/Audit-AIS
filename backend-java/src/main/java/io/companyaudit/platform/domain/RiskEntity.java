package io.companyaudit.platform.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "risks", uniqueConstraints = {
        @UniqueConstraint(name = "uq_risks_company_code", columnNames = {"company_id", "code"})
}, indexes = {
        @Index(name = "ix_risks_matrix", columnList = "company_id, probability, impact"),
        @Index(name = "ix_risks_severity", columnList = "company_id, severity, status")
})
public class RiskEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "department_id", nullable = false)
    private UUID departmentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id", insertable = false, updatable = false)
    private DepartmentEntity department;

    @Column(name = "owner_user_id")
    private UUID ownerUserId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_user_id", insertable = false, updatable = false)
    private UserEntity owner;

    @Column(name = "linked_audit_id")
    private UUID linkedAuditId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_audit_id", insertable = false, updatable = false)
    private AuditEntity linkedAudit;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "scope_description", nullable = false, columnDefinition = "TEXT")
    private String scopeDescription;

    @Column(name = "category", nullable = false, length = 32)
    private String category;

    @Column(name = "probability", nullable = false)
    private Integer probability;

    @Column(name = "impact", nullable = false)
    private Integer impact;

    @Column(name = "inherent_score", insertable = false, updatable = false)
    private Integer inherentScore;

    @Column(name = "severity", nullable = false, length = 16)
    private String severity;

    @Column(name = "residual_probability")
    private Integer residualProbability;

    @Column(name = "residual_impact")
    private Integer residualImpact;

    @Column(name = "mitigation_strategy", columnDefinition = "TEXT")
    private String mitigationStrategy;

    @Column(name = "narrative", columnDefinition = "TEXT")
    private String narrative;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "affected_assets", columnDefinition = "jsonb", nullable = false)
    private List<String> affectedAssets = new ArrayList<>();

    @Column(name = "mapped_frameworks", columnDefinition = "jsonb", nullable = false)
    private String mappedFrameworks = "[]";

    @Column(name = "escalation_target", length = 120)
    private String escalationTarget;

    @Column(name = "next_review_date")
    private LocalDate nextReviewDate;

    @Column(name = "status", nullable = false, length = 32)
    private String status = "Open";

    public RiskEntity() {}

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

    public UUID getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(UUID ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public UserEntity getOwner() {
        return owner;
    }

    public void setOwner(UserEntity owner) {
        this.owner = owner;
    }

    public UUID getLinkedAuditId() {
        return linkedAuditId;
    }

    public void setLinkedAuditId(UUID linkedAuditId) {
        this.linkedAuditId = linkedAuditId;
    }

    public AuditEntity getLinkedAudit() {
        return linkedAudit;
    }

    public void setLinkedAudit(AuditEntity linkedAudit) {
        this.linkedAudit = linkedAudit;
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

    public String getScopeDescription() {
        return scopeDescription;
    }

    public void setScopeDescription(String scopeDescription) {
        this.scopeDescription = scopeDescription;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public Integer getProbability() {
        return probability;
    }

    public void setProbability(Integer probability) {
        this.probability = probability;
    }

    public Integer getImpact() {
        return impact;
    }

    public void setImpact(Integer impact) {
        this.impact = impact;
    }

    public Integer getInherentScore() {
        if (inherentScore != null) {
            return inherentScore;
        }
        if (probability != null && impact != null) {
            return probability * impact;
        }
        return 0;
    }

    public void setInherentScore(Integer inherentScore) {
        this.inherentScore = inherentScore;
    }

    public String getSeverity() {
        return severity;
    }

    public void setSeverity(String severity) {
        this.severity = severity;
    }

    public Integer getResidualProbability() {
        return residualProbability;
    }

    public void setResidualProbability(Integer residualProbability) {
        this.residualProbability = residualProbability;
    }

    public Integer getResidualImpact() {
        return residualImpact;
    }

    public void setResidualImpact(Integer residualImpact) {
        this.residualImpact = residualImpact;
    }

    public String getMitigationStrategy() {
        return mitigationStrategy;
    }

    public void setMitigationStrategy(String mitigationStrategy) {
        this.mitigationStrategy = mitigationStrategy;
    }

    public String getNarrative() {
        return narrative;
    }

    public void setNarrative(String narrative) {
        this.narrative = narrative;
    }

    public List<String> getAffectedAssets() {
        return affectedAssets;
    }

    public void setAffectedAssets(List<String> affectedAssets) {
        this.affectedAssets = affectedAssets;
    }

    public String getMappedFrameworks() {
        return mappedFrameworks;
    }

    public void setMappedFrameworks(String mappedFrameworks) {
        this.mappedFrameworks = mappedFrameworks;
    }

    public String getEscalationTarget() {
        return escalationTarget;
    }

    public void setEscalationTarget(String escalationTarget) {
        this.escalationTarget = escalationTarget;
    }

    public LocalDate getNextReviewDate() {
        return nextReviewDate;
    }

    public void setNextReviewDate(LocalDate nextReviewDate) {
        this.nextReviewDate = nextReviewDate;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
