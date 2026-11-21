package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;

public class RiskEscalateRequest {

    @Size(max = 120)
    @JsonProperty("escalation_target")
    private String escalationTarget;

    @Size(max = 1000)
    private String note;

    public RiskEscalateRequest() {}

    public String getEscalationTarget() {
        return escalationTarget;
    }

    public void setEscalationTarget(String escalationTarget) {
        this.escalationTarget = escalationTarget;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}
