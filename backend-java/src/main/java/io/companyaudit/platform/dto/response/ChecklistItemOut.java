package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public class ChecklistItemOut {

    private UUID id;

    @JsonProperty("checklist_id")
    private UUID checklistId;

    @JsonProperty("checklist_code")
    private String checklistCode = "";

    private String framework = "";

    private String domain;

    @JsonProperty("control_code")
    private String controlCode;

    private String title;

    @JsonProperty("test_procedure")
    private String testProcedure;

    private BigDecimal weight;

    @JsonProperty("display_order")
    private int displayOrder;

    @JsonProperty("latest_response")
    private String latestResponse;

    @JsonProperty("latest_score_factor")
    private BigDecimal latestScoreFactor;

    @JsonProperty("latest_auditor_notes")
    private String latestAuditorNotes;

    @JsonProperty("latest_tested_at")
    private OffsetDateTime latestTestedAt;

    @JsonProperty("responder_name")
    private String responderName;

    @JsonProperty("evidence_count")
    private int evidenceCount = 0;

    public ChecklistItemOut() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getChecklistId() {
        return checklistId;
    }

    public void setChecklistId(UUID checklistId) {
        this.checklistId = checklistId;
    }

    public String getChecklistCode() {
        return checklistCode;
    }

    public void setChecklistCode(String checklistCode) {
        this.checklistCode = checklistCode;
    }

    public String getFramework() {
        return framework;
    }

    public void setFramework(String framework) {
        this.framework = framework;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getControlCode() {
        return controlCode;
    }

    public void setControlCode(String controlCode) {
        this.controlCode = controlCode;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getTestProcedure() {
        return testProcedure;
    }

    public void setTestProcedure(String testProcedure) {
        this.testProcedure = testProcedure;
    }

    public BigDecimal getWeight() {
        return weight;
    }

    public void setWeight(BigDecimal weight) {
        this.weight = weight;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public String getLatestResponse() {
        return latestResponse;
    }

    public void setLatestResponse(String latestResponse) {
        this.latestResponse = latestResponse;
    }

    public BigDecimal getLatestScoreFactor() {
        return latestScoreFactor;
    }

    public void setLatestScoreFactor(BigDecimal latestScoreFactor) {
        this.latestScoreFactor = latestScoreFactor;
    }

    public String getLatestAuditorNotes() {
        return latestAuditorNotes;
    }

    public void setLatestAuditorNotes(String latestAuditorNotes) {
        this.latestAuditorNotes = latestAuditorNotes;
    }

    public OffsetDateTime getLatestTestedAt() {
        return latestTestedAt;
    }

    public void setLatestTestedAt(OffsetDateTime latestTestedAt) {
        this.latestTestedAt = latestTestedAt;
    }

    public String getResponderName() {
        return responderName;
    }

    public void setResponderName(String responderName) {
        this.responderName = responderName;
    }

    public int getEvidenceCount() {
        return evidenceCount;
    }

    public void setEvidenceCount(int evidenceCount) {
        this.evidenceCount = evidenceCount;
    }
}
