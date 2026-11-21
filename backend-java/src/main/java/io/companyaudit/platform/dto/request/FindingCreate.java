package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

public class FindingCreate {

    @Size(min = 3, max = 32)
    private String code;

    @NotNull
    @JsonProperty("audit_id")
    private UUID auditId;

    @JsonProperty("audit_response_id")
    private UUID auditResponseId;

    @NotNull
    @JsonProperty("department_id")
    private UUID departmentId;

    @JsonProperty("owner_user_id")
    private UUID ownerUserId;

    @JsonProperty("lead_auditor_id")
    private UUID leadAuditorId;

    @NotBlank
    @Size(min = 3, max = 255)
    private String title;

    @NotBlank
    @Size(min = 5)
    @JsonProperty("root_cause")
    private String rootCause;

    @Size(max = 120)
    private String workstream;

    @NotBlank
    private String severity;

    private String status = "Open";

    @NotNull
    @JsonProperty("target_sla_date")
    private LocalDate targetSlaDate;

    @JsonProperty("management_response")
    private String managementResponse;

    public FindingCreate() {}

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public UUID getAuditId() {
        return auditId;
    }

    public void setAuditId(UUID auditId) {
        this.auditId = auditId;
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
}
