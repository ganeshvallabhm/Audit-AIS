package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.OffsetDateTime;
import java.util.UUID;

public class EvidenceOut {

    private UUID id;

    @JsonProperty("company_id")
    private UUID companyId;

    @JsonProperty("audit_id")
    private UUID auditId;

    @JsonProperty("audit_code")
    private String auditCode;

    @JsonProperty("department_name")
    private String departmentName;

    @JsonProperty("finding_id")
    private UUID findingId;

    @JsonProperty("finding_code")
    private String findingCode;

    @JsonProperty("corrective_action_id")
    private UUID correctiveActionId;

    @JsonProperty("checklist_item_id")
    private UUID checklistItemId;

    @JsonProperty("uploaded_by_user_id")
    private UUID uploadedByUserId;

    @JsonProperty("uploaded_by_name")
    private String uploadedByName;

    @JsonProperty("reviewed_by_user_id")
    private UUID reviewedByUserId;

    @JsonProperty("reviewed_by_name")
    private String reviewedByName;

    private String code;

    @JsonProperty("original_filename")
    private String originalFilename;

    @JsonProperty("mime_type")
    private String mimeType;

    @JsonProperty("byte_size")
    private Long byteSize;

    @JsonProperty("sha256_hash")
    private String sha256Hash;

    @JsonProperty("verification_status")
    private String verificationStatus;

    private String tag;

    @JsonProperty("reviewed_at")
    private OffsetDateTime reviewedAt;

    @JsonProperty("created_at")
    private OffsetDateTime createdAt;

    @JsonProperty("updated_at")
    private OffsetDateTime updatedAt;

    public EvidenceOut() {}

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

    public String getDepartmentName() {
        return departmentName;
    }

    public void setDepartmentName(String departmentName) {
        this.departmentName = departmentName;
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

    public UUID getCorrectiveActionId() {
        return correctiveActionId;
    }

    public void setCorrectiveActionId(UUID correctiveActionId) {
        this.correctiveActionId = correctiveActionId;
    }

    public UUID getChecklistItemId() {
        return checklistItemId;
    }

    public void setChecklistItemId(UUID checklistItemId) {
        this.checklistItemId = checklistItemId;
    }

    public UUID getUploadedByUserId() {
        return uploadedByUserId;
    }

    public void setUploadedByUserId(UUID uploadedByUserId) {
        this.uploadedByUserId = uploadedByUserId;
    }

    public String getUploadedByName() {
        return uploadedByName;
    }

    public void setUploadedByName(String uploadedByName) {
        this.uploadedByName = uploadedByName;
    }

    public UUID getReviewedByUserId() {
        return reviewedByUserId;
    }

    public void setReviewedByUserId(UUID reviewedByUserId) {
        this.reviewedByUserId = reviewedByUserId;
    }

    public String getReviewedByName() {
        return reviewedByName;
    }

    public void setReviewedByName(String reviewedByName) {
        this.reviewedByName = reviewedByName;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public void setOriginalFilename(String originalFilename) {
        this.originalFilename = originalFilename;
    }

    public String getMimeType() {
        return mimeType;
    }

    public void setMimeType(String mimeType) {
        this.mimeType = mimeType;
    }

    public Long getByteSize() {
        return byteSize;
    }

    public void setByteSize(Long byteSize) {
        this.byteSize = byteSize;
    }

    public String getSha256Hash() {
        return sha256Hash;
    }

    public void setSha256Hash(String sha256Hash) {
        this.sha256Hash = sha256Hash;
    }

    public String getVerificationStatus() {
        return verificationStatus;
    }

    public void setVerificationStatus(String verificationStatus) {
        this.verificationStatus = verificationStatus;
    }

    public String getTag() {
        return tag;
    }

    public void setTag(String tag) {
        this.tag = tag;
    }

    public OffsetDateTime getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(OffsetDateTime reviewedAt) {
        this.reviewedAt = reviewedAt;
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
