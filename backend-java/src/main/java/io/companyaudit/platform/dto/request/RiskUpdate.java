package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.companyaudit.platform.dto.response.RiskFrameworkItem;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

public class RiskUpdate {

    @Size(min = 3, max = 255)
    private String title;

    @Size(min = 5)
    @JsonProperty("scope_description")
    private String scopeDescription;

    private String category;

    @Min(1)
    @Max(5)
    private Integer probability;

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
    private List<String> affectedAssets;

    @JsonProperty("mapped_frameworks")
    private List<RiskFrameworkItem> mappedFrameworks;

    @Size(max = 120)
    @JsonProperty("escalation_target")
    private String escalationTarget;

    @JsonProperty("next_review_date")
    private LocalDate nextReviewDate;

    private String status;

    public RiskUpdate() {}

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
