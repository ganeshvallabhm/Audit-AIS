package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.OffsetDateTime;
import java.util.UUID;

public class AuditHistoryOut {

    private UUID id;

    @JsonProperty("company_id")
    private UUID companyId;

    private String category;
    private String module;

    @JsonProperty("entity_type")
    private String entityType;

    @JsonProperty("entity_id")
    private UUID entityId;

    @JsonProperty("entity_ref")
    private String entityRef;

    private String action;

    @JsonProperty("actor_id")
    private UUID actorId;

    @JsonProperty("actor_role")
    private String actorRole;

    @JsonProperty("ip_address")
    private String ipAddress;

    @JsonProperty("changes_json")
    private String changesJson;

    @JsonProperty("prev_event_sha256")
    private String prevEventSha256;

    @JsonProperty("event_sha256")
    private String eventSha256;

    @JsonProperty("created_at")
    private OffsetDateTime createdAt;

    public AuditHistoryOut() {}

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

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getModule() {
        return module;
    }

    public void setModule(String module) {
        this.module = module;
    }

    public String getEntityType() {
        return entityType;
    }

    public void setEntityType(String entityType) {
        this.entityType = entityType;
    }

    public UUID getEntityId() {
        return entityId;
    }

    public void setEntityId(UUID entityId) {
        this.entityId = entityId;
    }

    public String getEntityRef() {
        return entityRef;
    }

    public void setEntityRef(String entityRef) {
        this.entityRef = entityRef;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public UUID getActorId() {
        return actorId;
    }

    public void setActorId(UUID actorId) {
        this.actorId = actorId;
    }

    public String getActorRole() {
        return actorRole;
    }

    public void setActorRole(String actorRole) {
        this.actorRole = actorRole;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public String getChangesJson() {
        return changesJson;
    }

    public void setChangesJson(String changesJson) {
        this.changesJson = changesJson;
    }

    public String getPrevEventSha256() {
        return prevEventSha256;
    }

    public void setPrevEventSha256(String prevEventSha256) {
        this.prevEventSha256 = prevEventSha256;
    }

    public String getEventSha256() {
        return eventSha256;
    }

    public void setEventSha256(String eventSha256) {
        this.eventSha256 = eventSha256;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
