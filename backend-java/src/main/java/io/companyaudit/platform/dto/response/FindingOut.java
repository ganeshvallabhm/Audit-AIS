package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class FindingOut {

    private UUID id;

    @JsonProperty("company_id")
    private UUID companyId;

    @JsonProperty("audit_id")
    private UUID auditId;

    @JsonProperty("audit_code")
    private String auditCode;

    @JsonProperty("audit_title")
    private String auditTitle;

    @JsonProperty("audit_response_id")
    private UUID auditResponseId;

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

    @JsonProperty("lead_auditor_id")
    private UUID leadAuditorId;

    @JsonProperty("lead_auditor_name")
    private String leadAuditorName = "Unassigned";

    @JsonProperty("signed_off_by_id")
    private UUID signedOffById;

    @JsonProperty("signed_off_by_name")
    private String signedOffByName;

    private String code;
    private String title;

    @JsonProperty("root_cause")
    private String rootCause;

    private String workstream;
    private String severity;
    private String status;

    @JsonProperty("target_sla_date")
    private LocalDate targetSlaDate;

    @JsonProperty("sla_countdown")
    private String slaCountdown;

    @JsonProperty("is_overdue")
    private Boolean isOverdue;

    @JsonProperty("progress_percent")
    private Integer progressPercent;

    @JsonProperty("management_response")
    private String managementResponse;

    @JsonProperty("rejection_reason")
    private String rejectionReason;

    @JsonProperty("signed_off_at")
    private OffsetDateTime signedOffAt;

    private List<RecommendationOut> recommendations = new ArrayList<>();

    @JsonProperty("corrective_actions")
    private List<CorrectiveActionOut> correctiveActions = new ArrayList<>();

    @JsonProperty("evidence_items")
    private List<FindingEvidenceRefOut> evidenceItems = new ArrayList<>();

    @JsonProperty("created_at")
    private OffsetDateTime createdAt;

    @JsonProperty("updated_at")
    private OffsetDateTime updatedAt;

    public FindingOut() {}

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

    public UUID getAuditId() {
        return auditId;
    }

    public void setAuditId(UUID auditId) {
        this.auditId = auditId;
    }

    public String getAuditCode() {
        return auditCode;
    }

    public void setAuditCode(String auditCode) {
        this.auditCode = auditCode;
    }

    public String getAuditTitle() {
        return auditTitle;
    }

    public void setAuditTitle(String auditTitle) {
        this.auditTitle = auditTitle;
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

    public UUID getSignedOffById() {
        return signedOffById;
    }

    public void setSignedOffById(UUID signedOffById) {
        this.signedOffById = signedOffById;
    }

    public String getSignedOffByName() {
        return signedOffByName;
    }

    public void setSignedOffByName(String signedOffByName) {
        this.signedOffByName = signedOffByName;
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

    public String getSlaCountdown() {
        return slaCountdown;
    }

    public void setSlaCountdown(String slaCountdown) {
        this.slaCountdown = slaCountdown;
    }

    public Boolean getIsOverdue() {
        return isOverdue;
    }

    public void setIsOverdue(Boolean isOverdue) {
        this.isOverdue = isOverdue;
    }

    public Integer getProgressPercent() {
        return progressPercent;
    }

    public void setProgressPercent(Integer progressPercent) {
        this.progressPercent = progressPercent;
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

    public OffsetDateTime getSignedOffAt() {
        return signedOffAt;
    }

    public void setSignedOffAt(OffsetDateTime signedOffAt) {
        this.signedOffAt = signedOffAt;
    }

    public List<RecommendationOut> getRecommendations() {
        return recommendations;
    }

    public void setRecommendations(List<RecommendationOut> recommendations) {
        this.recommendations = recommendations;
    }

    public List<CorrectiveActionOut> getCorrectiveActions() {
        return correctiveActions;
    }

    public void setCorrectiveActions(List<CorrectiveActionOut> correctiveActions) {
        this.correctiveActions = correctiveActions;
    }

    public List<FindingEvidenceRefOut> getEvidenceItems() {
        return evidenceItems;
    }

    public void setEvidenceItems(List<FindingEvidenceRefOut> evidenceItems) {
        this.evidenceItems = evidenceItems;
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
