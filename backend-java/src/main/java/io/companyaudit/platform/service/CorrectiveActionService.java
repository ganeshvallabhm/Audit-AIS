package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.CorrectiveActionEntity;
import io.companyaudit.platform.domain.FindingEntity;
import io.companyaudit.platform.domain.RiskEntity;
import io.companyaudit.platform.domain.UserEntity;
import io.companyaudit.platform.dto.request.CorrectiveActionCreate;
import io.companyaudit.platform.dto.request.CorrectiveActionUpdate;
import io.companyaudit.platform.dto.response.CorrectiveActionOut;
import io.companyaudit.platform.dto.response.MessageResponse;
import io.companyaudit.platform.dto.response.PaginatedResponse;
import io.companyaudit.platform.repository.CorrectiveActionRepository;
import io.companyaudit.platform.repository.FindingRepository;
import io.companyaudit.platform.repository.RiskRepository;
import io.companyaudit.platform.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class CorrectiveActionService {

    private final CorrectiveActionRepository correctiveActionRepository;
    private final FindingRepository findingRepository;
    private final RiskRepository riskRepository;
    private final UserRepository userRepository;
    private final AuditHistoryService auditHistoryService;

    public CorrectiveActionService(CorrectiveActionRepository correctiveActionRepository,
                                   FindingRepository findingRepository,
                                   RiskRepository riskRepository,
                                   UserRepository userRepository,
                                   AuditHistoryService auditHistoryService) {
        this.correctiveActionRepository = correctiveActionRepository;
        this.findingRepository = findingRepository;
        this.riskRepository = riskRepository;
        this.userRepository = userRepository;
        this.auditHistoryService = auditHistoryService;
    }

    @Transactional(readOnly = true)
    public PaginatedResponse<CorrectiveActionOut> listActions(UUID companyId,
                                                             UUID findingId,
                                                             UUID riskId,
                                                             String status,
                                                             int limit,
                                                             int offset) {
        List<CorrectiveActionEntity> all = correctiveActionRepository.findByCompanyIdOrderByDueDateAscStepOrderAsc(companyId);

        List<CorrectiveActionEntity> filtered = all.stream().filter(a -> {
            if (findingId != null && !findingId.equals(a.getFindingId())) {
                return false;
            }
            if (riskId != null && !riskId.equals(a.getRiskId())) {
                return false;
            }
            if (status != null && !status.isBlank() && !status.equalsIgnoreCase(a.getStatus())) {
                return false;
            }
            return true;
        }).collect(Collectors.toList());

        int total = filtered.size();
        int fromIndex = Math.min(offset, total);
        int toIndex = Math.min(fromIndex + limit, total);
        List<CorrectiveActionEntity> paged = filtered.subList(fromIndex, toIndex);

        List<CorrectiveActionOut> items = serializeActions(companyId, paged);
        return new PaginatedResponse<>(items, (long) total, offset / Math.max(1, limit) + 1, limit);
    }

    @Transactional(readOnly = true)
    public CorrectiveActionOut getAction(UUID companyId, UUID actionId) {
        CorrectiveActionEntity action = correctiveActionRepository.findByIdAndCompanyId(actionId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Corrective action not found."));
        return serializeAction(companyId, action);
    }

    @Transactional
    public CorrectiveActionOut createAction(UUID companyId,
                                            UUID currentUserId,
                                            String userRole,
                                            UUID currentUserDeptId,
                                            CorrectiveActionCreate request,
                                            String ipAddress) {
        if (request.getFindingId() == null && request.getRiskId() == null) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "A Corrective Action must link to either finding_id or risk_id.");
        }

        UUID targetDeptId = null;
        if (request.getFindingId() != null) {
            FindingEntity f = findingRepository.findByIdAndCompanyId(request.getFindingId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Finding not found."));
            targetDeptId = f.getDepartmentId();
        }
        if (request.getRiskId() != null) {
            RiskEntity r = riskRepository.findByIdAndCompanyId(request.getRiskId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Risk not found."));
            if (targetDeptId == null) {
                targetDeptId = r.getDepartmentId();
            }
        }

        if ("Department Head".equalsIgnoreCase(userRole) && currentUserDeptId != null && targetDeptId != null) {
            if (!currentUserDeptId.equals(targetDeptId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Department Heads can only create actions within their department.");
            }
        }

        String code;
        if (request.getCode() != null && !request.getCode().isBlank()) {
            code = request.getCode().trim().toUpperCase(Locale.ROOT);
        } else {
            code = generateNextActionCode(companyId);
        }

        if (correctiveActionRepository.existsByCompanyIdAndCode(companyId, code)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Corrective action code '" + code + "' already exists.");
        }

        CorrectiveActionEntity action = new CorrectiveActionEntity();
        action.setCompanyId(companyId);
        action.setFindingId(request.getFindingId());
        action.setRecommendationId(request.getRecommendationId());
        action.setRiskId(request.getRiskId());
        action.setAssignedToUserId(request.getAssignedToUserId() != null ? request.getAssignedToUserId() : currentUserId);
        action.setCode(code);
        action.setStepOrder(request.getStepOrder() != null ? request.getStepOrder() : 1);
        action.setTitle(request.getTitle().trim());
        action.setDetail(request.getDetail());
        action.setStatus(request.getStatus() != null ? request.getStatus() : "Pending");
        action.setProgressPercent(request.getProgressPercent() != null ? request.getProgressPercent() : 0);
        action.setDueDate(request.getDueDate());

        CorrectiveActionEntity saved = correctiveActionRepository.saveAndFlush(action);

        auditHistoryService.recordEvent(
                companyId,
                "Mutation",
                "Findings & Actions",
                "CorrectiveAction",
                saved.getId(),
                saved.getCode(),
                "Created corrective action '" + saved.getTitle() + "'",
                currentUserId,
                userRole,
                ipAddress,
                Collections.emptyMap()
        );

        return serializeAction(companyId, saved);
    }

    @Transactional
    public CorrectiveActionOut updateAction(UUID companyId,
                                            UUID actionId,
                                            UUID currentUserId,
                                            String userRole,
                                            UUID currentUserDeptId,
                                            CorrectiveActionUpdate request,
                                            String ipAddress) {
        CorrectiveActionEntity action = correctiveActionRepository.findByIdAndCompanyId(actionId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Corrective action not found."));

        UUID targetDeptId = null;
        if (action.getFindingId() != null) {
            FindingEntity f = findingRepository.findByIdAndCompanyId(action.getFindingId(), companyId).orElse(null);
            if (f != null) targetDeptId = f.getDepartmentId();
        } else if (action.getRiskId() != null) {
            RiskEntity r = riskRepository.findByIdAndCompanyId(action.getRiskId(), companyId).orElse(null);
            if (r != null) targetDeptId = r.getDepartmentId();
        }

        if ("Department Head".equalsIgnoreCase(userRole)) {
            if (currentUserDeptId != null && targetDeptId != null && !currentUserDeptId.equals(targetDeptId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Department Heads can only modify actions within their department.");
            }
            if (request.getStatus() != null && Set.of("Verified", "Rejected").contains(request.getStatus())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only Auditors or Admins can verify or reject completed corrective actions.");
            }
        }

        if (request.getTitle() != null) action.setTitle(request.getTitle().trim());
        if (request.getDetail() != null) action.setDetail(request.getDetail());
        if (request.getAssignedToUserId() != null) action.setAssignedToUserId(request.getAssignedToUserId());
        if (request.getDueDate() != null) action.setDueDate(request.getDueDate());
        if (request.getProgressPercent() != null) action.setProgressPercent(request.getProgressPercent());

        if (request.getStatus() != null) {
            action.setStatus(request.getStatus());
            if ("Submitted".equalsIgnoreCase(request.getStatus())) {
                if (action.getCompletedAt() == null) {
                    action.setCompletedAt(OffsetDateTime.now());
                }
                if (request.getProgressPercent() == null) {
                    action.setProgressPercent(100);
                }
            } else if ("Verified".equalsIgnoreCase(request.getStatus())) {
                action.setVerifiedByUserId(currentUserId);
                action.setVerifiedAt(OffsetDateTime.now());
                action.setProgressPercent(100);
            }
        }

        CorrectiveActionEntity saved = correctiveActionRepository.saveAndFlush(action);

        String category = "Verified".equalsIgnoreCase(saved.getStatus()) ? "Sign-Off" : "Mutation";
        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("status", saved.getStatus());
        changes.put("progress_percent", saved.getProgressPercent());

        auditHistoryService.recordEvent(
                companyId,
                category,
                "Findings & Actions",
                "CorrectiveAction",
                saved.getId(),
                saved.getCode(),
                "Updated corrective action '" + saved.getCode() + "' -> " + saved.getStatus() + " (" + saved.getProgressPercent() + "%)",
                currentUserId,
                userRole,
                ipAddress,
                changes
        );

        return serializeAction(companyId, saved);
    }

    @Transactional
    public MessageResponse deleteAction(UUID companyId, UUID actionId, UUID currentUserId, String userRole, String ipAddress) {
        CorrectiveActionEntity action = correctiveActionRepository.findByIdAndCompanyId(actionId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Corrective action not found."));

        if ("Verified".equalsIgnoreCase(action.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Verified corrective actions cannot be deleted.");
        }

        String code = action.getCode();
        String title = action.getTitle();

        correctiveActionRepository.delete(action);
        correctiveActionRepository.flush();

        auditHistoryService.recordEvent(
                companyId,
                "Mutation",
                "Findings & Actions",
                "CorrectiveAction",
                actionId,
                code,
                "Deleted corrective action '" + code + ": " + title + "'",
                currentUserId,
                userRole,
                ipAddress,
                Collections.emptyMap()
        );

        return new MessageResponse("Corrective action '" + code + "' deleted.");
    }

    public CorrectiveActionOut serializeAction(UUID companyId, CorrectiveActionEntity act) {
        return serializeActions(companyId, List.of(act)).get(0);
    }

    public List<CorrectiveActionOut> serializeActions(UUID companyId, List<CorrectiveActionEntity> actions) {
        if (actions == null || actions.isEmpty()) {
            return Collections.emptyList();
        }

        Set<UUID> findingIds = actions.stream().map(CorrectiveActionEntity::getFindingId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> riskIds = actions.stream().map(CorrectiveActionEntity::getRiskId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> userIds = new HashSet<>();
        for (CorrectiveActionEntity a : actions) {
            if (a.getAssignedToUserId() != null) userIds.add(a.getAssignedToUserId());
            if (a.getVerifiedByUserId() != null) userIds.add(a.getVerifiedByUserId());
        }

        Map<UUID, FindingEntity> findingMap = findingIds.isEmpty() ? Collections.emptyMap() :
                findingRepository.findAllById(findingIds).stream().collect(Collectors.toMap(FindingEntity::getId, f -> f, (a, b) -> a));

        Map<UUID, RiskEntity> riskMap = riskIds.isEmpty() ? Collections.emptyMap() :
                riskRepository.findAllById(riskIds).stream().collect(Collectors.toMap(RiskEntity::getId, r -> r, (a, b) -> a));

        Map<UUID, UserEntity> userMap = userIds.isEmpty() ? Collections.emptyMap() :
                userRepository.findAllById(userIds).stream().collect(Collectors.toMap(UserEntity::getId, u -> u, (a, b) -> a));

        List<CorrectiveActionOut> output = new ArrayList<>();
        for (CorrectiveActionEntity act : actions) {
            FindingEntity f = act.getFindingId() != null ? findingMap.get(act.getFindingId()) : null;
            RiskEntity r = act.getRiskId() != null ? riskMap.get(act.getRiskId()) : null;
            UserEntity assigned = act.getAssignedToUserId() != null ? userMap.get(act.getAssignedToUserId()) : null;
            UserEntity verified = act.getVerifiedByUserId() != null ? userMap.get(act.getVerifiedByUserId()) : null;

            CorrectiveActionOut ao = new CorrectiveActionOut();
            ao.setId(act.getId());
            ao.setCompanyId(act.getCompanyId());
            ao.setFindingId(act.getFindingId());
            ao.setFindingCode(f != null ? f.getCode() : null);
            ao.setFindingTitle(f != null ? f.getTitle() : null);
            ao.setRecommendationId(act.getRecommendationId());
            ao.setRiskId(act.getRiskId());
            ao.setRiskCode(r != null ? r.getCode() : null);
            ao.setAssignedToUserId(act.getAssignedToUserId());
            ao.setAssignedToName(assigned != null ? assigned.getFullName() : null);
            ao.setVerifiedByUserId(act.getVerifiedByUserId());
            ao.setVerifiedByName(verified != null ? verified.getFullName() : null);
            ao.setCode(act.getCode());
            ao.setStepOrder(act.getStepOrder());
            ao.setTitle(act.getTitle());
            ao.setDetail(act.getDetail());
            ao.setStatus(act.getStatus());
            ao.setProgressPercent(act.getProgressPercent());
            ao.setDueDate(act.getDueDate());
            ao.setCompletedAt(act.getCompletedAt());
            ao.setVerifiedAt(act.getVerifiedAt());
            ao.setCreatedAt(act.getCreatedAt());
            ao.setUpdatedAt(act.getUpdatedAt());

            output.add(ao);
        }

        return output;
    }

    public String generateNextActionCode(UUID companyId) {
        List<CorrectiveActionEntity> existing = correctiveActionRepository.findByCompanyIdOrderByDueDateAscStepOrderAsc(companyId);
        int maxNum = 110;
        Pattern pattern = Pattern.compile("^ACT-(\\d+)$");
        for (CorrectiveActionEntity a : existing) {
            if (a.getCode() != null) {
                Matcher m = pattern.matcher(a.getCode());
                if (m.matches()) {
                    try {
                        int num = Integer.parseInt(m.group(1));
                        if (num > maxNum) maxNum = num;
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        return "ACT-" + (maxNum + 1);
    }
}
