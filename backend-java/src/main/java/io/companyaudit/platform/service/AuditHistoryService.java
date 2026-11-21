package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.AuditHistoryEntity;
import io.companyaudit.platform.domain.UserEntity;
import io.companyaudit.platform.repository.AuditHistoryRepository;
import io.companyaudit.platform.util.AuditHashCalculator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

@Service
public class AuditHistoryService {

    private final AuditHistoryRepository auditHistoryRepository;

    public AuditHistoryService(AuditHistoryRepository auditHistoryRepository) {
        this.auditHistoryRepository = auditHistoryRepository;
    }

    /**
     * Records a tamper-evident audit history event cryptographically chained to the company's ledger.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public AuditHistoryEntity recordAuditHistory(
            UUID companyId,
            UserEntity actor,
            String category,
            String module,
            String entityType,
            UUID entityId,
            String entityRef,
            String action,
            Map<String, Object> changes,
            String ipAddress
    ) {
        String actorLabel = actor != null ? actor.getFullName() : "System Engine";
        String actorRole = actor != null ? (actor.getJobTitle() != null ? actor.getJobTitle() : actor.getRole()) : "Automated Governance";
        UUID actorUserId = actor != null ? actor.getId() : null;

        // Retrieve latest chain tip hash
        Optional<AuditHistoryEntity> latestTip = auditHistoryRepository.findTopByCompanyIdOrderByCreatedAtDesc(companyId);
        String prevHash = latestTip.map(AuditHistoryEntity::getEventSha256).orElse(null);

        Map<String, Object> safeChanges = changes != null ? changes : Collections.emptyMap();

        // Build canonical payload strictly matching Python's build_audit_history_payload
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("company_id", String.valueOf(companyId));
        payload.put("actor_user_id", actorUserId != null ? String.valueOf(actorUserId) : null);
        payload.put("category", category);
        payload.put("module", module);
        payload.put("entity_type", entityType);
        payload.put("entity_id", String.valueOf(entityId));
        payload.put("entity_ref", entityRef);
        payload.put("action", action);
        payload.put("changes", safeChanges);
        payload.put("prev_event_sha256", prevHash);

        String eventSha256 = AuditHashCalculator.computeEventSha256(payload);

        AuditHistoryEntity entry = new AuditHistoryEntity();
        entry.setCompanyId(companyId);
        entry.setActorUserId(actorUserId);
        entry.setActorLabel(actorLabel);
        entry.setActorRole(actorRole);
        entry.setCategory(category);
        entry.setModule(module);
        entry.setEntityType(entityType);
        entry.setEntityId(entityId);
        entry.setEntityRef(entityRef);
        entry.setAction(action);
        entry.setChangesJson(new HashMap<>(safeChanges));
        entry.setIpAddress(ipAddress);
        entry.setPrevEventSha256(prevHash);
        entry.setEventSha256(eventSha256);
        entry.setCreatedAt(OffsetDateTime.now());

        return auditHistoryRepository.save(entry);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public AuditHistoryEntity recordEvent(
            UUID companyId,
            String category,
            String module,
            String entityType,
            UUID entityId,
            String entityRef,
            String action,
            UUID actorUserId,
            String actorRole,
            String ipAddress,
            Map<String, ?> changes
    ) {
        Optional<AuditHistoryEntity> latestTip = auditHistoryRepository.findTopByCompanyIdOrderByCreatedAtDesc(companyId);
        String prevHash = latestTip.map(AuditHistoryEntity::getEventSha256).orElse(null);

        Map<String, Object> safeChanges = changes != null ? new HashMap<>(changes) : Collections.emptyMap();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("company_id", String.valueOf(companyId));
        payload.put("actor_user_id", actorUserId != null ? String.valueOf(actorUserId) : null);
        payload.put("category", category);
        payload.put("module", module);
        payload.put("entity_type", entityType);
        payload.put("entity_id", String.valueOf(entityId));
        payload.put("entity_ref", entityRef);
        payload.put("action", action);
        payload.put("changes", safeChanges);
        payload.put("prev_event_sha256", prevHash);

        String eventSha256 = AuditHashCalculator.computeEventSha256(payload);

        AuditHistoryEntity entry = new AuditHistoryEntity();
        entry.setCompanyId(companyId);
        entry.setActorUserId(actorUserId);
        entry.setActorLabel(actorRole != null ? actorRole : "System Engine");
        entry.setActorRole(actorRole != null ? actorRole : "Automated Governance");
        entry.setCategory(category);
        entry.setModule(module);
        entry.setEntityType(entityType);
        entry.setEntityId(entityId);
        entry.setEntityRef(entityRef);
        entry.setAction(action);
        entry.setChangesJson(new HashMap<>(safeChanges));
        entry.setIpAddress(ipAddress);
        entry.setPrevEventSha256(prevHash);
        entry.setEventSha256(eventSha256);
        entry.setCreatedAt(OffsetDateTime.now());

        return auditHistoryRepository.save(entry);
    }
}
