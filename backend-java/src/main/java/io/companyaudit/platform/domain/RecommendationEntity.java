package io.companyaudit.platform.domain;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "recommendations", indexes = {
        @Index(name = "ix_recommendations_finding", columnList = "company_id, finding_id")
})
public class RecommendationEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "finding_id", nullable = false)
    private UUID findingId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "finding_id", insertable = false, updatable = false)
    private FindingEntity finding;

    @Column(name = "risk_id")
    private UUID riskId;

    @Column(name = "author_user_id")
    private UUID authorUserId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_user_id", insertable = false, updatable = false)
    private UserEntity author;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "guidance", nullable = false, columnDefinition = "TEXT")
    private String guidance;

    @Column(name = "priority", nullable = false, length = 16)
    private String priority = "High";

    @Column(name = "management_response", columnDefinition = "TEXT")
    private String managementResponse;

    @Column(name = "accepted_by_management", nullable = false)
    private Boolean acceptedByManagement = false;

    @Column(name = "accepted_at")
    private OffsetDateTime acceptedAt;

    public RecommendationEntity() {}

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

    public UUID getRiskId() {
        return riskId;
    }

    public void setRiskId(UUID riskId) {
        this.riskId = riskId;
    }

    public UUID getAuthorUserId() {
        return authorUserId;
    }

    public void setAuthorUserId(UUID authorUserId) {
        this.authorUserId = authorUserId;
    }

    public UserEntity getAuthor() {
        return author;
    }

    public void setAuthor(UserEntity author) {
        this.author = author;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getGuidance() {
        return guidance;
    }

    public void setGuidance(String guidance) {
        this.guidance = guidance;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getManagementResponse() {
        return managementResponse;
    }

    public void setManagementResponse(String managementResponse) {
        this.managementResponse = managementResponse;
    }

    public Boolean getAcceptedByManagement() {
        return acceptedByManagement;
    }

    public void setAcceptedByManagement(Boolean acceptedByManagement) {
        this.acceptedByManagement = acceptedByManagement;
    }

    public OffsetDateTime getAcceptedAt() {
        return acceptedAt;
    }

    public void setAcceptedAt(OffsetDateTime acceptedAt) {
        this.acceptedAt = acceptedAt;
    }
}
