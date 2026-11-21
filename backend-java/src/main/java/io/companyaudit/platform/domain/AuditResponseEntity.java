package io.companyaudit.platform.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "audit_responses", uniqueConstraints = {
        @UniqueConstraint(name = "uq_audit_responses_audit_item", columnNames = {"audit_id", "checklist_item_id"})
}, indexes = {
        @Index(name = "ix_audit_responses_audit", columnList = "company_id, audit_id")
})
public class AuditResponseEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "audit_id", nullable = false)
    private UUID auditId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "audit_id", insertable = false, updatable = false)
    private AuditEntity audit;

    @Column(name = "checklist_item_id", nullable = false)
    private UUID checklistItemId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "checklist_item_id", insertable = false, updatable = false)
    private ChecklistItemEntity checklistItem;

    @Column(name = "responder_user_id")
    private UUID responderUserId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "responder_user_id", insertable = false, updatable = false)
    private UserEntity responder;

    @Column(name = "response_value", nullable = false, length = 16)
    private String responseValue;

    @Column(name = "score_factor", precision = 3, scale = 2)
    private BigDecimal scoreFactor;

    @Column(name = "auditor_notes", columnDefinition = "TEXT")
    private String auditorNotes;

    @Column(name = "tested_at", nullable = false)
    private OffsetDateTime testedAt;

    public AuditResponseEntity() {}

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

    public UUID getChecklistItemId() {
        return checklistItemId;
    }

    public void setChecklistItemId(UUID checklistItemId) {
        this.checklistItemId = checklistItemId;
    }

    public ChecklistItemEntity getChecklistItem() {
        return checklistItem;
    }

    public void setChecklistItem(ChecklistItemEntity checklistItem) {
        this.checklistItem = checklistItem;
    }

    public UUID getResponderUserId() {
        return responderUserId;
    }

    public void setResponderUserId(UUID responderUserId) {
        this.responderUserId = responderUserId;
    }

    public UserEntity getResponder() {
        return responder;
    }

    public void setResponder(UserEntity responder) {
        this.responder = responder;
    }

    public String getResponseValue() {
        return responseValue;
    }

    public void setResponseValue(String responseValue) {
        this.responseValue = responseValue;
    }

    public BigDecimal getScoreFactor() {
        return scoreFactor;
    }

    public void setScoreFactor(BigDecimal scoreFactor) {
        this.scoreFactor = scoreFactor;
    }

    public String getAuditorNotes() {
        return auditorNotes;
    }

    public void setAuditorNotes(String auditorNotes) {
        this.auditorNotes = auditorNotes;
    }

    public OffsetDateTime getTestedAt() {
        return testedAt;
    }

    public void setTestedAt(OffsetDateTime testedAt) {
        this.testedAt = testedAt;
    }
}
