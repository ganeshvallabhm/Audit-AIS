package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.OffsetDateTime;
import java.util.UUID;

public class AuditResponseOut {

    private UUID id;

    @JsonProperty("audit_id")
    private UUID auditId;

    @JsonProperty("checklist_item_id")
    private UUID checklistItemId;

    @JsonProperty("control_code")
    private String controlCode;

    @JsonProperty("item_title")
    private String itemTitle;

    @JsonProperty("responder_user_id")
    private UUID responderUserId;

    @JsonProperty("responder_name")
    private String responderName;

    @JsonProperty("response_value")
    private String responseValue;

    @JsonProperty("score_factor")
    private Double scoreFactor;

    private Double weight;

    @JsonProperty("auditor_notes")
    private String auditorNotes;

    @JsonProperty("tested_at")
    private OffsetDateTime testedAt;

    public AuditResponseOut() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getAuditId() {
        return auditId;
    }

    public void setAuditId(UUID auditId) {
        this.auditId = auditId;
    }

    public UUID getChecklistItemId() {
        return checklistItemId;
    }

    public void setChecklistItemId(UUID checklistItemId) {
        this.checklistItemId = checklistItemId;
    }

    public String getControlCode() {
        return controlCode;
    }

    public void setControlCode(String controlCode) {
        this.controlCode = controlCode;
    }

    public String getItemTitle() {
        return itemTitle;
    }

    public void setItemTitle(String itemTitle) {
        this.itemTitle = itemTitle;
    }

    public UUID getResponderUserId() {
        return responderUserId;
    }

    public void setResponderUserId(UUID responderUserId) {
        this.responderUserId = responderUserId;
    }

    public String getResponderName() {
        return responderName;
    }

    public void setResponderName(String responderName) {
        this.responderName = responderName;
    }

    public String getResponseValue() {
        return responseValue;
    }

    public void setResponseValue(String responseValue) {
        this.responseValue = responseValue;
    }

    public Double getScoreFactor() {
        return scoreFactor;
    }

    public void setScoreFactor(Double scoreFactor) {
        this.scoreFactor = scoreFactor;
    }

    public Double getWeight() {
        return weight;
    }

    public void setWeight(Double weight) {
        this.weight = weight;
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
