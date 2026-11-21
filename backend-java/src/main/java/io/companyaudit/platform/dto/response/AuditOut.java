package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class AuditOut {

    private UUID id;

    @JsonProperty("company_id")
    private UUID companyId;

    @JsonProperty("department_id")
    private UUID departmentId;

    @JsonProperty("department_name")
    private String departmentName = "Unknown Department";

    @JsonProperty("department_code")
    private String departmentCode = "N/A";

    @JsonProperty("lead_auditor_id")
    private UUID leadAuditorId;

    @JsonProperty("lead_auditor_name")
    private String leadAuditorName = "Unassigned";

    @JsonProperty("lead_auditor_initials")
    private String leadAuditorInitials = "UA";

    @JsonProperty("lead_auditor_role")
    private String leadAuditorRole = "Auditor";

    private String code;
    private String title;
    private String domain;
    private String framework;
    private String status;

    @JsonProperty("computed_score")
    private Double computedScore;

    @JsonProperty("controls_evaluated")
    private int controlsEvaluated = 0;

    @JsonProperty("controls_total")
    private int controlsTotal = 0;

    @JsonProperty("scheduled_start")
    private LocalDate scheduledStart;

    @JsonProperty("target_due_date")
    private LocalDate targetDueDate;

    @JsonProperty("completed_at")
    private OffsetDateTime completedAt;

    private String summary;

    private List<AuditScopeOut> scopes = new ArrayList<>();

    private List<AuditStageOut> stages = new ArrayList<>();

    @JsonProperty("allowed_next_statuses")
    private List<String> allowedNextStatuses = new ArrayList<>();

    @JsonProperty("created_at")
    private OffsetDateTime createdAt;

    @JsonProperty("updated_at")
    private OffsetDateTime updatedAt;

    public AuditOut() {}

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

    public UUID getLeadAuditorId() {
        return leadAuditorId;
    }

    public void setLeadAuditorId(UUID leadAuditorId) {
        this.leadAuditorId = leadAuditorId;
    }

    public String getLeadAuditorName() {
        return leadAuditorName;
    }

    public void setLeadAuditorName(String leadAuditorName) {
        this.leadAuditorName = leadAuditorName;
    }

    public String getLeadAuditorInitials() {
        return leadAuditorInitials;
    }

    public void setLeadAuditorInitials(String leadAuditorInitials) {
        this.leadAuditorInitials = leadAuditorInitials;
    }

    public String getLeadAuditorRole() {
        return leadAuditorRole;
    }

    public void setLeadAuditorRole(String leadAuditorRole) {
        this.leadAuditorRole = leadAuditorRole;
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

    public Double getComputedScore() {
        return computedScore;
    }

    public void setComputedScore(Double computedScore) {
        this.computedScore = computedScore;
    }

    public int getControlsEvaluated() {
        return controlsEvaluated;
    }

    public void setControlsEvaluated(int controlsEvaluated) {
        this.controlsEvaluated = controlsEvaluated;
    }

    public int getControlsTotal() {
        return controlsTotal;
    }

    public void setControlsTotal(int controlsTotal) {
        this.controlsTotal = controlsTotal;
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

    public List<AuditScopeOut> getScopes() {
        return scopes;
    }

    public void setScopes(List<AuditScopeOut> scopes) {
        this.scopes = scopes;
    }

    public List<AuditStageOut> getStages() {
        return stages;
    }

    public void setStages(List<AuditStageOut> stages) {
        this.stages = stages;
    }

    public List<String> getAllowedNextStatuses() {
        return allowedNextStatuses;
    }

    public void setAllowedNextStatuses(List<String> allowedNextStatuses) {
        this.allowedNextStatuses = allowedNextStatuses;
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
