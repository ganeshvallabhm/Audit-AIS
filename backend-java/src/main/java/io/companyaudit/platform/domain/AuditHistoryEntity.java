package io.companyaudit.platform.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "audit_history", indexes = {
        @Index(name = "ix_audit_history_company_time", columnList = "company_id, created_at DESC"),
        @Index(name = "ix_audit_history_entity", columnList = "company_id, entity_type, entity_id")
})
public class AuditHistoryEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_user_id", insertable = false, updatable = false)
    private UserEntity actorUser;

    @Column(name = "actor_label", nullable = false, length = 150)
    private String actorLabel;

    @Column(name = "actor_role", nullable = false, length = 64)
    private String actorRole;

    @Column(name = "category", nullable = false, length = 32)
    private String category;

    @Column(name = "module", nullable = false, length = 64)
    private String module;

    @Column(name = "entity_type", nullable = false, length = 48)
    private String entityType;

    @Column(name = "entity_id", nullable = false)
    private UUID entityId;

    @Column(name = "entity_ref", nullable = false, length = 48)
    private String entityRef;

    @Column(name = "action", nullable = false, columnDefinition = "TEXT")
    private String action;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "changes_json", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> changesJson = new HashMap<>();

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "prev_event_sha256", length = 64)
    private String prevEventSha256;

    @Column(name = "event_sha256", nullable = false, length = 64)
    private String eventSha256;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    public AuditHistoryEntity() {}

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

    public UUID getActorUserId() {
        return actorUserId;
    }

    public void setActorUserId(UUID actorUserId) {
        this.actorUserId = actorUserId;
    }

    public UserEntity getActorUser() {
        return actorUser;
    }

    public void setActorUser(UserEntity actorUser) {
        this.actorUser = actorUser;
    }

    public String getActorLabel() {
        return actorLabel;
    }

    public void setActorLabel(String actorLabel) {
        this.actorLabel = actorLabel;
    }

    public String getActorRole() {
        return actorRole;
    }

    public void setActorRole(String actorRole) {
        this.actorRole = actorRole;
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

    public Map<String, Object> getChangesJson() {
        return changesJson;
    }

    public void setChangesJson(Map<String, Object> changesJson) {
        this.changesJson = changesJson;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
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
