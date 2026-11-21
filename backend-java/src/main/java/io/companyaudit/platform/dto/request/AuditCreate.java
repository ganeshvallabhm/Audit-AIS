package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class AuditCreate {

    @Size(min = 3, max = 32)
    private String code;

    @NotBlank
    @Size(min = 3, max = 255)
    private String title;

    @NotBlank
    @Size(min = 2, max = 32)
    private String domain;

    @NotNull
    @JsonProperty("department_id")
    private UUID departmentId;

    @JsonProperty("lead_auditor_id")
    private UUID leadAuditorId;

    @NotBlank
    @Size(min = 2, max = 150)
    private String framework;

    private String status = "Draft";

    @JsonProperty("scheduled_start")
    private LocalDate scheduledStart;

    @JsonProperty("target_due_date")
    private LocalDate targetDueDate;

    private String summary;

    private List<AuditScopeCreate> scopes = new ArrayList<>();

    public AuditCreate() {}

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

    public UUID getDepartmentId() {
        return departmentId;
    }

    public void setDepartmentId(UUID departmentId) {
        this.departmentId = departmentId;
    }

    public UUID getLeadAuditorId() {
        return leadAuditorId;
    }

    public void setLeadAuditorId(UUID leadAuditorId) {
        this.leadAuditorId = leadAuditorId;
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

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public List<AuditScopeCreate> getScopes() {
        return scopes;
    }

    public void setScopes(List<AuditScopeCreate> scopes) {
        this.scopes = scopes;
    }
}
