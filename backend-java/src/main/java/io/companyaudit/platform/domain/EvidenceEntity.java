package io.companyaudit.platform.domain;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "evidence", uniqueConstraints = {
        @UniqueConstraint(name = "uq_evidence_company_code", columnNames = {"company_id", "code"})
}, indexes = {
        @Index(name = "ix_evidence_audit_finding", columnList = "company_id, audit_id, finding_id"),
        @Index(name = "ix_evidence_company_status", columnList = "company_id, verification_status")
})
public class EvidenceEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "audit_id")
    private UUID auditId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "audit_id", insertable = false, updatable = false)
    private AuditEntity audit;

    @Column(name = "finding_id")
    private UUID findingId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "finding_id", insertable = false, updatable = false)
    private FindingEntity finding;

    @Column(name = "corrective_action_id")
    private UUID correctiveActionId;

    @Column(name = "checklist_item_id")
    private UUID checklistItemId;

    @Column(name = "uploaded_by_user_id", nullable = false)
    private UUID uploadedByUserId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploaded_by_user_id", insertable = false, updatable = false)
    private UserEntity uploadedBy;

    @Column(name = "reviewed_by_user_id")
    private UUID reviewedByUserId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by_user_id", insertable = false, updatable = false)
    private UserEntity reviewedBy;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(name = "storage_key", nullable = false, length = 512, unique = true)
    private String storageKey;

    @Column(name = "mime_type", nullable = false, length = 120)
    private String mimeType;

    @Column(name = "byte_size", nullable = false)
    private Long byteSize;

    @Column(name = "sha256_hash", nullable = false, length = 64)
    private String sha256Hash;

    @Column(name = "verification_status", nullable = false, length = 24)
    private String verificationStatus = "Pending Review";

    @Column(name = "tag", length = 80)
    private String tag;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    public EvidenceEntity() {}

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

    public AuditEntity getAudit() {
        return audit;
    }

    public void setAudit(AuditEntity audit) {
        this.audit = audit;
    }

    public UUID getFindingId() {
        return findingId;
    }

    public void setFindingId(UUID findingId) {
        this.findingId = findingId;
    }

    public FindingEntity getFinding() {
        return finding;
    }

    public void setFinding(FindingEntity finding) {
        this.finding = finding;
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

    public UserEntity getUploadedBy() {
        return uploadedBy;
    }

    public void setUploadedBy(UserEntity uploadedBy) {
        this.uploadedBy = uploadedBy;
    }

    public UUID getReviewedByUserId() {
        return reviewedByUserId;
    }

    public void setReviewedByUserId(UUID reviewedByUserId) {
        this.reviewedByUserId = reviewedByUserId;
    }

    public UserEntity getReviewedBy() {
        return reviewedBy;
    }

    public void setReviewedBy(UserEntity reviewedBy) {
        this.reviewedBy = reviewedBy;
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

    public String getStorageKey() {
        return storageKey;
    }

    public void setStorageKey(String storageKey) {
        this.storageKey = storageKey;
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
}
