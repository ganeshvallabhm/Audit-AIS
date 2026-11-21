package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public class CorrectiveActionOut {

    private UUID id;

    @JsonProperty("company_id")
    private UUID companyId;

    @JsonProperty("finding_id")
    private UUID findingId;

    @JsonProperty("finding_code")
    private String findingCode;

    @JsonProperty("finding_title")
    private String findingTitle;

    @JsonProperty("recommendation_id")
    private UUID recommendationId;

    @JsonProperty("risk_id")
    private UUID riskId;

    @JsonProperty("risk_code")
    private String riskCode;

    @JsonProperty("assigned_to_user_id")
    private UUID assignedToUserId;

    @JsonProperty("assigned_to_name")
    private String assignedToName;

    @JsonProperty("verified_by_user_id")
    private UUID verifiedByUserId;

    @JsonProperty("verified_by_name")
    private String verifiedByName;

    private String code;

    @JsonProperty("step_order")
    private Integer stepOrder;

    private String title;
    private String detail;
    private String status;

    @JsonProperty("progress_percent")
    private Integer progressPercent;

    @JsonProperty("due_date")
    private LocalDate dueDate;

    @JsonProperty("completed_at")
    private OffsetDateTime completedAt;

    @JsonProperty("verified_at")
    private OffsetDateTime verifiedAt;

    @JsonProperty("created_at")
    private OffsetDateTime createdAt;

    @JsonProperty("updated_at")
    private OffsetDateTime updatedAt;

    public CorrectiveActionOut() {}

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

    public String getFindingCode() {
        return findingCode;
    }

    public void setFindingCode(String findingCode) {
        this.findingCode = findingCode;
    }

    public String getFindingTitle() {
        return findingTitle;
    }

    public void setFindingTitle(String findingTitle) {
        this.findingTitle = findingTitle;
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

    public String getRiskCode() {
        return riskCode;
    }

    public void setRiskCode(String riskCode) {
        this.riskCode = riskCode;
    }

    public UUID getAssignedToUserId() {
        return assignedToUserId;
    }

    public void setAssignedToUserId(UUID assignedToUserId) {
        this.assignedToUserId = assignedToUserId;
    }

    public String getAssignedToName() {
        return assignedToName;
    }

    public void setAssignedToName(String assignedToName) {
        this.assignedToName = assignedToName;
    }

    public UUID getVerifiedByUserId() {
        return verifiedByUserId;
    }

    public void setVerifiedByUserId(UUID verifiedByUserId) {
        this.verifiedByUserId = verifiedByUserId;
    }

    public String getVerifiedByName() {
        return verifiedByName;
    }

    public void setVerifiedByName(String verifiedByName) {
        this.verifiedByName = verifiedByName;
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

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
