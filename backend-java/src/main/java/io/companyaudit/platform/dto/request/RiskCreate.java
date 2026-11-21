package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.companyaudit.platform.dto.response.RiskFrameworkItem;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class RiskCreate {

    @Size(min = 3, max = 32)
    private String code;

    @NotNull
    @JsonProperty("department_id")
    private UUID departmentId;

    @JsonProperty("owner_user_id")
    private UUID ownerUserId;

    @JsonProperty("linked_audit_id")
    private UUID linkedAuditId;

    @NotBlank
    @Size(min = 3, max = 255)
    private String title;

    @NotBlank
    @Size(min = 5)
    @JsonProperty("scope_description")
    private String scopeDescription;

    @NotBlank
    private String category;

    @NotNull
    @Min(1)
    @Max(5)
    private Integer probability;

    @NotNull
    @Min(1)
    @Max(5)
    private Integer impact;

    @Min(1)
    @Max(5)
    @JsonProperty("residual_probability")
    private Integer residualProbability;

    @Min(1)
    @Max(5)
    @JsonProperty("residual_impact")
    private Integer residualImpact;

    @JsonProperty("mitigation_strategy")
    private String mitigationStrategy;

    private String narrative;

    @JsonProperty("affected_assets")
    private List<String> affectedAssets = new ArrayList<>();

    @JsonProperty("mapped_frameworks")
    private List<RiskFrameworkItem> mappedFrameworks = new ArrayList<>();

    @Size(max = 120)
    @JsonProperty("escalation_target")
    private String escalationTarget;

    @JsonProperty("next_review_date")
    private LocalDate nextReviewDate;

    private String status = "Open";

    public RiskCreate() {}

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public UUID getDepartmentId() {
        return departmentId;
    }

    public void setDepartmentId(UUID departmentId) {
        this.departmentId = departmentId;
    }

    public UUID getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(UUID ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public UUID getLinkedAuditId() {
        return linkedAuditId;
    }

    public void setLinkedAuditId(UUID linkedAuditId) {
        this.linkedAuditId = linkedAuditId;
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

    public List<RiskFrameworkItem> getMappedFrameworks() {
        return mappedFrameworks;
    }

    public void setMappedFrameworks(List<RiskFrameworkItem> mappedFrameworks) {
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
