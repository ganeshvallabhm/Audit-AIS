package io.companyaudit.platform.domain;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "corrective_actions", uniqueConstraints = {
        @UniqueConstraint(name = "uq_corrective_actions_company_code", columnNames = {"company_id", "code"})
}, indexes = {
        @Index(name = "ix_actions_assignee_due", columnList = "company_id, assigned_to_user_id, due_date")
})
public class CorrectiveActionEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "finding_id")
    private UUID findingId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "finding_id", insertable = false, updatable = false)
    private FindingEntity finding;

    @Column(name = "recommendation_id")
    private UUID recommendationId;

    @Column(name = "risk_id")
    private UUID riskId;

    @Column(name = "assigned_to_user_id")
    private UUID assignedToUserId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_to_user_id", insertable = false, updatable = false)
    private UserEntity assignedTo;

    @Column(name = "verified_by_user_id")
    private UUID verifiedByUserId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "verified_by_user_id", insertable = false, updatable = false)
    private UserEntity verifiedBy;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "step_order", nullable = false)
    private Integer stepOrder = 1;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "detail", columnDefinition = "TEXT")
    private String detail;

    @Column(name = "status", nullable = false, length = 24)
    private String status = "Pending";

    @Column(name = "progress_percent", nullable = false)
    private Integer progressPercent = 0;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "verified_at")
    private OffsetDateTime verifiedAt;

    public CorrectiveActionEntity() {}

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

    public UUID getFindingId() {
        return findingId;
    }

    public void setFindingId(UUID findingId) {
        this.findingId = findingId;
    }

    public FindingEntity getFinding() {
        return finding;
    }

    public void setFinding(FindingEntity finding) {
        this.finding = finding;
    }

    public UUID getRecommendationId() {
        return recommendationId;
    }

    public void setRecommendationId(UUID recommendationId) {
        this.recommendationId = recommendationId;
    }

    public UUID getRiskId() {
        return riskId;
    }

    public void setRiskId(UUID riskId) {
        this.riskId = riskId;
    }

    public UUID getAssignedToUserId() {
        return assignedToUserId;
    }

    public void setAssignedToUserId(UUID assignedToUserId) {
        this.assignedToUserId = assignedToUserId;
    }

    public UserEntity getAssignedTo() {
        return assignedTo;
    }

    public void setAssignedTo(UserEntity assignedTo) {
        this.assignedTo = assignedTo;
    }

    public UUID getVerifiedByUserId() {
        return verifiedByUserId;
    }

    public void setVerifiedByUserId(UUID verifiedByUserId) {
        this.verifiedByUserId = verifiedByUserId;
    }

    public UserEntity getVerifiedBy() {
        return verifiedBy;
    }

    public void setVerifiedBy(UserEntity verifiedBy) {
        this.verifiedBy = verifiedBy;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public Integer getStepOrder() {
        return stepOrder;
    }

    public void setStepOrder(Integer stepOrder) {
        this.stepOrder = stepOrder;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDetail() {
        return detail;
    }

    public void setDetail(String detail) {
        this.detail = detail;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getProgressPercent() {
        return progressPercent;
    }

    public void setProgressPercent(Integer progressPercent) {
        this.progressPercent = progressPercent;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public OffsetDateTime getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(OffsetDateTime completedAt) {
        this.completedAt = completedAt;
    }

    public OffsetDateTime getVerifiedAt() {
        return verifiedAt;
    }

    public void setVerifiedAt(OffsetDateTime verifiedAt) {
        this.verifiedAt = verifiedAt;
    }
}
