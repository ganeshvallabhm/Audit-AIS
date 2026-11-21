package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

public class CorrectiveActionCreate {

    @Size(min = 3, max = 32)
    private String code;

    @JsonProperty("finding_id")
    private UUID findingId;

    @JsonProperty("recommendation_id")
    private UUID recommendationId;

    @JsonProperty("risk_id")
    private UUID riskId;

    @JsonProperty("assigned_to_user_id")
    private UUID assignedToUserId;

    @Min(1)
    @JsonProperty("step_order")
    private Integer stepOrder = 1;

    @NotBlank
    @Size(min = 3, max = 255)
    private String title;

    private String detail;

    private String status = "Pending";

    @JsonProperty("progress_percent")
    private Integer progressPercent = 0;

    @NotNull
    @JsonProperty("due_date")
    private LocalDate dueDate;

    public CorrectiveActionCreate() {}

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public UUID getFindingId() {
        return findingId;
    }

    public void setFindingId(UUID findingId) {
        this.findingId = findingId;
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
}
