package io.companyaudit.platform.domain;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "findings", uniqueConstraints = {
        @UniqueConstraint(name = "uq_findings_company_code", columnNames = {"company_id", "code"})
}, indexes = {
        @Index(name = "ix_findings_company_status_sev", columnList = "company_id, status, severity"),
        @Index(name = "ix_findings_company_dept_status", columnList = "company_id, department_id, status"),
        @Index(name = "ix_findings_sla", columnList = "company_id, target_sla_date")
})
public class FindingEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "audit_id", nullable = false)
    private UUID auditId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "audit_id", insertable = false, updatable = false)
    private AuditEntity audit;

    @Column(name = "audit_response_id")
    private UUID auditResponseId;

    @Column(name = "department_id", nullable = false)
    private UUID departmentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id", insertable = false, updatable = false)
    private DepartmentEntity department;

    @Column(name = "owner_user_id")
    private UUID ownerUserId;

    @Column(name = "lead_auditor_id")
    private UUID leadAuditorId;

    @Column(name = "signed_off_by_id")
    private UUID signedOffById;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "root_cause", nullable = false, columnDefinition = "TEXT")
    private String rootCause;

    @Column(name = "workstream", length = 120)
    private String workstream;

    @Column(name = "severity", nullable = false, length = 16)
    private String severity;

    @Column(name = "status", nullable = false, length = 32)
    private String status = "Open";

    @Column(name = "target_sla_date", nullable = false)
    private LocalDate targetSlaDate;

    @Column(name = "management_response", columnDefinition = "TEXT")
    private String managementResponse;

    @Column(name = "rejection_reason", columnDefinition = "TEXT")
    private String rejectionReason;

    @Column(name = "signed_off_at")
    private OffsetDateTime signedOffAt;

    @OneToMany(mappedBy = "finding", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private java.util.List<RecommendationEntity> recommendations = new java.util.ArrayList<>();

    @OneToMany(mappedBy = "finding", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private java.util.List<CorrectiveActionEntity> correctiveActions = new java.util.ArrayList<>();

    @OneToMany(mappedBy = "finding", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private java.util.List<EvidenceEntity> evidenceItems = new java.util.ArrayList<>();

    public FindingEntity() {}

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

    public UUID getAuditId() {
        return auditId;
    }

    public void setAuditId(UUID auditId) {
        this.auditId = auditId;
    }

    public AuditEntity getAudit() {
        return audit;
    }

    public void setAudit(AuditEntity audit) {
        this.audit = audit;
    }

    public UUID getAuditResponseId() {
        return auditResponseId;
    }

    public void setAuditResponseId(UUID auditResponseId) {
        this.auditResponseId = auditResponseId;
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

    public UUID getLeadAuditorId() {
        return leadAuditorId;
    }

    public void setLeadAuditorId(UUID leadAuditorId) {
        this.leadAuditorId = leadAuditorId;
    }

    public UUID getSignedOffById() {
        return signedOffById;
    }

    public void setSignedOffById(UUID signedOffById) {
        this.signedOffById = signedOffById;
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

    public String getRootCause() {
        return rootCause;
    }

    public void setRootCause(String rootCause) {
        this.rootCause = rootCause;
    }

    public String getWorkstream() {
        return workstream;
    }

    public void setWorkstream(String workstream) {
        this.workstream = workstream;
    }

    public String getSeverity() {
        return severity;
    }

    public void setSeverity(String severity) {
        this.severity = severity;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalDate getTargetSlaDate() {
        return targetSlaDate;
    }

    public void setTargetSlaDate(LocalDate targetSlaDate) {
        this.targetSlaDate = targetSlaDate;
    }

    public String getManagementResponse() {
        return managementResponse;
    }

    public void setManagementResponse(String managementResponse) {
        this.managementResponse = managementResponse;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public OffsetDateTime getSignedOffAt() {
        return signedOffAt;
    }

    public void setSignedOffAt(OffsetDateTime signedOffAt) {
        this.signedOffAt = signedOffAt;
    }

    public java.util.List<RecommendationEntity> getRecommendations() {
        return recommendations;
    }

    public void setRecommendations(java.util.List<RecommendationEntity> recommendations) {
        this.recommendations = recommendations;
    }

    public java.util.List<CorrectiveActionEntity> getCorrectiveActions() {
        return correctiveActions;
    }

    public void setCorrectiveActions(java.util.List<CorrectiveActionEntity> correctiveActions) {
        this.correctiveActions = correctiveActions;
    }

    public java.util.List<EvidenceEntity> getEvidenceItems() {
        return evidenceItems;
    }

    public void setEvidenceItems(java.util.List<EvidenceEntity> evidenceItems) {
        this.evidenceItems = evidenceItems;
    }
}
