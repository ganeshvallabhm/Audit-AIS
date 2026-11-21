package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public class AuditResponseItemInput {

    @NotNull
    @JsonProperty("checklist_item_id")
    private UUID checklistItemId;

    @NotBlank
    @JsonProperty("response_value")
    private String responseValue;

    @Size(max = 2000)
    @JsonProperty("auditor_notes")
    private String auditorNotes;

    public AuditResponseItemInput() {}

    public AuditResponseItemInput(UUID checklistItemId, String responseValue, String auditorNotes) {
        this.checklistItemId = checklistItemId;
        this.responseValue = responseValue;
        this.auditorNotes = auditorNotes;
    }

    public UUID getChecklistItemId() {
        return checklistItemId;
    }

    public void setChecklistItemId(UUID checklistItemId) {
        this.checklistItemId = checklistItemId;
    }

    public String getResponseValue() {
        return responseValue;
    }

    public void setResponseValue(String responseValue) {
        this.responseValue = responseValue;
    }

    public String getAuditorNotes() {
        return auditorNotes;
    }

    public void setAuditorNotes(String auditorNotes) {
        this.auditorNotes = auditorNotes;
    }
}
