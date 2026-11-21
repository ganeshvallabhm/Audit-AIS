package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public class EvidenceUpdate {

    @JsonProperty("audit_id")
    private UUID auditId;

    @JsonProperty("finding_id")
    private UUID findingId;

    @JsonProperty("corrective_action_id")
    private UUID correctiveActionId;

    @JsonProperty("checklist_item_id")
    private UUID checklistItemId;

    @Size(max = 80)
    private String tag;

    public EvidenceUpdate() {}

    public UUID getAuditId() {
        return auditId;
    }

    public void setAuditId(UUID auditId) {
        this.auditId = auditId;
    }

    public UUID getFindingId() {
        return findingId;
    }

    public void setFindingId(UUID findingId) {
        this.findingId = findingId;
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

    public String getTag() {
        return tag;
    }

    public void setTag(String tag) {
        this.tag = tag;
    }
}
