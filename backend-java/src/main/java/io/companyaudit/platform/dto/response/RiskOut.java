package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class RiskOut {

    private UUID id;

    @JsonProperty("company_id")
    private UUID companyId;

    @JsonProperty("department_id")
    private UUID departmentId;

    @JsonProperty("department_name")
    private String departmentName;

    @JsonProperty("department_code")
    private String departmentCode;

    @JsonProperty("owner_user_id")
    private UUID ownerUserId;

    @JsonProperty("owner_name")
    private String ownerName = "Unassigned";

    @JsonProperty("owner_initials")
    private String ownerInitials = "UA";

    @JsonProperty("owner_role")
    private String ownerRole = "Risk Owner";

    @JsonProperty("linked_audit_id")
    private UUID linkedAuditId;

    @JsonProperty("linked_audit_code")
    private String linkedAuditCode;

    private String code;
    private String title;

    @JsonProperty("scope_description")
    private String scopeDescription;

    private String category;
    private Integer probability;
    private Integer impact;

    @JsonProperty("inherent_score")
    private Integer inherentScore;

    private String severity;

    @JsonProperty("residual_probability")
    private Integer residualProbability;

    @JsonProperty("residual_impact")
    private Integer residualImpact;

    @JsonProperty("residual_score")
    private Integer residualScore;

    @JsonProperty("residual_level")
    private String residualLevel;

    @JsonProperty("mitigation_strategy")
    private String mitigationStrategy;

    private String narrative;

    @JsonProperty("affected_assets")
    private List<String> affectedAssets = new ArrayList<>();

    @JsonProperty("mapped_frameworks")
    private List<RiskFrameworkItem> mappedFrameworks = new ArrayList<>();

    @JsonProperty("escalation_target")
    private String escalationTarget;

    @JsonProperty("next_review_date")
    private LocalDate nextReviewDate;

    private String status;

    @JsonProperty("progress_percent")
    private Integer progressPercent = 0;

    @JsonProperty("corrective_actions")
    private List<CorrectiveActionOut> correctiveActions = new ArrayList<>();

    @JsonProperty("created_at")
    private OffsetDateTime createdAt;

    @JsonProperty("updated_at")
    private OffsetDateTime updatedAt;

    public RiskOut() {}

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

    public String getDepartmentName() {
        return departmentName;
    }

    public void setDepartmentName(String departmentName) {
        this.departmentName = departmentName;
    }

    public String getDepartmentCode() {
        return departmentCode;
    }

    public void setDepartmentCode(String departmentCode) {
        this.departmentCode = departmentCode;
    }

    public UUID getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(UUID ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public String getOwnerName() {
        return ownerName;
    }

    public void setOwnerName(String ownerName) {
        this.ownerName = ownerName;
    }

    public String getOwnerInitials() {
        return ownerInitials;
    }

    public void setOwnerInitials(String ownerInitials) {
        this.ownerInitials = ownerInitials;
    }

    public String getOwnerRole() {
        return ownerRole;
    }

    public void setOwnerRole(String ownerRole) {
        this.ownerRole = ownerRole;
    }

    public UUID getLinkedAuditId() {
        return linkedAuditId;
    }

    public void setLinkedAuditId(UUID linkedAuditId) {
        this.linkedAuditId = linkedAuditId;
    }

    public String getLinkedAuditCode() {
        return linkedAuditCode;
    }

    public void setLinkedAuditCode(String linkedAuditCode) {
        this.linkedAuditCode = linkedAuditCode;
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
        return inherentScore;
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

    public Integer getResidualScore() {
        return residualScore;
    }

    public void setResidualScore(Integer residualScore) {
        this.residualScore = residualScore;
    }

    public String getResidualLevel() {
        return residualLevel;
    }

    public void setResidualLevel(String residualLevel) {
        this.residualLevel = residualLevel;
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

    public Integer getProgressPercent() {
        return progressPercent;
    }

    public void setProgressPercent(Integer progressPercent) {
        this.progressPercent = progressPercent;
    }

    public List<CorrectiveActionOut> getCorrectiveActions() {
        return correctiveActions;
    }

    public void setCorrectiveActions(List<CorrectiveActionOut> correctiveActions) {
        this.correctiveActions = correctiveActions;
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
