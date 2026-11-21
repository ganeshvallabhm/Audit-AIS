package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

public class FindingUpdate {

    @Size(min = 3, max = 255)
    private String title;

    @Size(min = 5)
    @JsonProperty("root_cause")
    private String rootCause;

    @Size(max = 120)
    private String workstream;

    private String severity;

    private String status;

    @JsonProperty("owner_user_id")
    private UUID ownerUserId;

    @JsonProperty("target_sla_date")
    private LocalDate targetSlaDate;

    @JsonProperty("management_response")
    private String managementResponse;

    @JsonProperty("rejection_reason")
    private String rejectionReason;

    @JsonProperty("sign_off")
    private Boolean signOff;

    public FindingUpdate() {}

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

    public UUID getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(UUID ownerUserId) {
        this.ownerUserId = ownerUserId;
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

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public Boolean getSignOff() {
        return signOff;
    }

    public void setSignOff(Boolean signOff) {
        this.signOff = signOff;
    }
}
