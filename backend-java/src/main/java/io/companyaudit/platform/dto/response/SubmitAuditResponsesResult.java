package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class SubmitAuditResponsesResult {

    @JsonProperty("audit_id")
    private UUID auditId;

    @JsonProperty("audit_code")
    private String auditCode;

    @JsonProperty("computed_score")
    private Double computedScore;

    @JsonProperty("controls_evaluated")
    private int controlsEvaluated;

    @JsonProperty("controls_total")
    private int controlsTotal;

    @JsonProperty("saved_count")
    private int savedCount;

    private List<AuditResponseOut> responses = new ArrayList<>();

    public SubmitAuditResponsesResult() {}

    public SubmitAuditResponsesResult(UUID auditId, String auditCode, Double computedScore,
                                      int controlsEvaluated, int controlsTotal, int savedCount,
                                      List<AuditResponseOut> responses) {
        this.auditId = auditId;
        this.auditCode = auditCode;
        this.computedScore = computedScore;
        this.controlsEvaluated = controlsEvaluated;
        this.controlsTotal = controlsTotal;
        this.savedCount = savedCount;
        this.responses = responses;
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

    public int getSavedCount() {
        return savedCount;
    }

    public void setSavedCount(int savedCount) {
        this.savedCount = savedCount;
    }

    public List<AuditResponseOut> getResponses() {
        return responses;
    }

    public void setResponses(List<AuditResponseOut> responses) {
        this.responses = responses;
    }
}
