package io.companyaudit.platform.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.companyaudit.platform.domain.AuditEntity;
import io.companyaudit.platform.domain.CorrectiveActionEntity;
import io.companyaudit.platform.domain.DepartmentEntity;
import io.companyaudit.platform.domain.RiskEntity;
import io.companyaudit.platform.domain.UserEntity;
import io.companyaudit.platform.dto.request.RiskCreate;
import io.companyaudit.platform.dto.request.RiskEscalateRequest;
import io.companyaudit.platform.dto.request.RiskUpdate;
import io.companyaudit.platform.dto.response.CorrectiveActionOut;
import io.companyaudit.platform.dto.response.PaginatedResponse;
import io.companyaudit.platform.dto.response.RiskFrameworkItem;
import io.companyaudit.platform.dto.response.RiskOut;
import io.companyaudit.platform.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class RiskService {

    private final RiskRepository riskRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final AuditRepository auditRepository;
    private final CorrectiveActionRepository correctiveActionRepository;
    private final CorrectiveActionService correctiveActionService;
    private final AuditHistoryService auditHistoryService;
    private final ObjectMapper objectMapper;

    public RiskService(RiskRepository riskRepository,
                       DepartmentRepository departmentRepository,
                       UserRepository userRepository,
                       AuditRepository auditRepository,
                       CorrectiveActionRepository correctiveActionRepository,
                       CorrectiveActionService correctiveActionService,
                       AuditHistoryService auditHistoryService,
                       ObjectMapper objectMapper) {
        this.riskRepository = riskRepository;
        this.departmentRepository = departmentRepository;
        this.userRepository = userRepository;
        this.auditRepository = auditRepository;
        this.correctiveActionRepository = correctiveActionRepository;
        this.correctiveActionService = correctiveActionService;
        this.auditHistoryService = auditHistoryService;
        this.objectMapper = objectMapper;
    }

    public static String classifyRiskSeverity(int score) {
        if (score <= 4) {
            return "Low";
        }
        if (score <= 9) {
            return "Medium";
        }
        if (score <= 16) {
            return "High";
        }
        return "Critical";
    }

    @Transactional(readOnly = true)
    public PaginatedResponse<RiskOut> listRisks(UUID companyId,
                                                String category,
                                                String severity,
                                                String status,
                                                Integer probability,
                                                Integer impact,
                                                String search,
                                                int limit,
                                                int offset) {
        List<RiskEntity> all = riskRepository.findByCompanyIdOrderByInherentScoreDescCodeAsc(companyId);

        List<RiskEntity> filtered = all.stream().filter(r -> {
            if (category != null && !category.isBlank() && !category.equalsIgnoreCase(r.getCategory())) {
                return false;
            }
            if (severity != null && !severity.isBlank() && !severity.equalsIgnoreCase(r.getSeverity())) {
                return false;
            }
            if (status != null && !status.isBlank() && !status.equalsIgnoreCase(r.getStatus())) {
                return false;
            }
            if (probability != null && !probability.equals(r.getProbability())) {
                return false;
            }
            if (impact != null && !impact.equals(r.getImpact())) {
                return false;
            }
            if (search != null && !search.trim().isEmpty()) {
                String term = search.trim().toLowerCase(Locale.ROOT);
                boolean matchCode = r.getCode() != null && r.getCode().toLowerCase(Locale.ROOT).contains(term);
                boolean matchTitle = r.getTitle() != null && r.getTitle().toLowerCase(Locale.ROOT).contains(term);
                boolean matchScope = r.getScopeDescription() != null && r.getScopeDescription().toLowerCase(Locale.ROOT).contains(term);
                if (!matchCode && !matchTitle && !matchScope) {
                    return false;
                }
            }
            return true;
        }).collect(Collectors.toList());

        int total = filtered.size();
        int fromIndex = Math.min(offset, total);
        int toIndex = Math.min(fromIndex + limit, total);
        List<RiskEntity> paged = filtered.subList(fromIndex, toIndex);

        List<RiskOut> items = serializeRisks(companyId, paged);
        return new PaginatedResponse<>(items, (long) total, offset / Math.max(1, limit) + 1, limit);
    }

    @Transactional(readOnly = true)
    public RiskOut getRisk(UUID companyId, UUID riskId) {
        RiskEntity risk = riskRepository.findByIdAndCompanyId(riskId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Risk not found."));
        return serializeRisk(companyId, risk);
    }

    @Transactional
    public RiskOut createRisk(UUID companyId, UUID currentUserId, String userRole, RiskCreate request, String ipAddress) {
        DepartmentEntity dept = departmentRepository.findById(request.getDepartmentId())
                .filter(d -> companyId.equals(d.getCompanyId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found."));

        if (request.getLinkedAuditId() != null) {
            auditRepository.findByIdAndCompanyId(request.getLinkedAuditId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Linked audit not found."));
        }

        String code;
        if (request.getCode() != null && !request.getCode().isBlank()) {
            code = request.getCode().trim().toUpperCase(Locale.ROOT);
        } else {
            code = generateNextRiskCode(companyId);
        }

        if (riskRepository.existsByCompanyIdAndCode(companyId, code)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Risk code '" + code + "' already exists.");
        }

        int score = request.getProbability() * request.getImpact();
        String computedSeverity = classifyRiskSeverity(score);

        String frameworksJson = "[]";
        if (request.getMappedFrameworks() != null && !request.getMappedFrameworks().isEmpty()) {
            try {
                frameworksJson = objectMapper.writeValueAsString(request.getMappedFrameworks());
            } catch (Exception ignored) {}
        }

        RiskEntity risk = new RiskEntity();
        risk.setCompanyId(companyId);
        risk.setDepartmentId(request.getDepartmentId());
        risk.setOwnerUserId(request.getOwnerUserId() != null ? request.getOwnerUserId() : dept.getHeadUserId());
        risk.setLinkedAuditId(request.getLinkedAuditId());
        risk.setCode(code);
        risk.setTitle(request.getTitle().trim());
        risk.setScopeDescription(request.getScopeDescription().trim());
        risk.setCategory(request.getCategory());
        risk.setProbability(request.getProbability());
        risk.setImpact(request.getImpact());
        risk.setInherentScore(score);
        risk.setSeverity(computedSeverity);
        risk.setResidualProbability(request.getResidualProbability());
        risk.setResidualImpact(request.getResidualImpact());
        risk.setMitigationStrategy(request.getMitigationStrategy());
        risk.setNarrative(request.getNarrative());
        risk.setAffectedAssets(request.getAffectedAssets() != null ? request.getAffectedAssets() : new ArrayList<>());
        risk.setMappedFrameworks(frameworksJson);
        risk.setEscalationTarget(request.getEscalationTarget());
        risk.setNextReviewDate(request.getNextReviewDate());
        risk.setStatus(request.getStatus() != null ? request.getStatus() : "Open");

        RiskEntity saved = riskRepository.saveAndFlush(risk);

        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("severity", computedSeverity);
        changes.put("inherent_score", score);

        String category = "Critical".equalsIgnoreCase(computedSeverity) ? "Risk Escalation" : "Mutation";

        auditHistoryService.recordEvent(
                companyId,
                category,
                "Risk & Compliance",
                "Risk",
                saved.getId(),
                saved.getCode(),
                "Registered risk '" + saved.getTitle() + "' (" + saved.getProbability() + "x" + saved.getImpact() + "=" + score + " " + computedSeverity + ")",
                currentUserId,
                userRole,
                ipAddress,
                changes
        );

        return serializeRisk(companyId, saved);
    }

    @Transactional
    public RiskOut updateRisk(UUID companyId, UUID riskId, UUID currentUserId, String userRole, RiskUpdate request, String ipAddress) {
        RiskEntity risk = riskRepository.findByIdAndCompanyId(riskId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Risk not found."));

        if ("Management".equalsIgnoreCase(userRole)) {
            if (request.getTitle() != null || request.getScopeDescription() != null || request.getCategory() != null ||
                    request.getProbability() != null || request.getImpact() != null || request.getResidualProbability() != null ||
                    request.getResidualImpact() != null || request.getMitigationStrategy() != null || request.getNarrative() != null ||
                    request.getAffectedAssets() != null || request.getMappedFrameworks() != null) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Management can only update risk status, escalation_target, and next_review_date.");
            }
        }

        if (request.getTitle() != null) risk.setTitle(request.getTitle().trim());
        if (request.getScopeDescription() != null) risk.setScopeDescription(request.getScopeDescription().trim());
        if (request.getCategory() != null) risk.setCategory(request.getCategory());
        if (request.getProbability() != null) risk.setProbability(request.getProbability());
        if (request.getImpact() != null) risk.setImpact(request.getImpact());
        if (request.getResidualProbability() != null) risk.setResidualProbability(request.getResidualProbability());
        if (request.getResidualImpact() != null) risk.setResidualImpact(request.getResidualImpact());
        if (request.getMitigationStrategy() != null) risk.setMitigationStrategy(request.getMitigationStrategy());
        if (request.getNarrative() != null) risk.setNarrative(request.getNarrative());
        if (request.getAffectedAssets() != null) risk.setAffectedAssets(request.getAffectedAssets());
        if (request.getEscalationTarget() != null) risk.setEscalationTarget(request.getEscalationTarget());
        if (request.getNextReviewDate() != null) risk.setNextReviewDate(request.getNextReviewDate());
        if (request.getStatus() != null) risk.setStatus(request.getStatus());

        if (request.getMappedFrameworks() != null) {
            try {
                risk.setMappedFrameworks(objectMapper.writeValueAsString(request.getMappedFrameworks()));
            } catch (Exception ignored) {}
        }

        int score = risk.getProbability() * risk.getImpact();
        risk.setInherentScore(score);
        risk.setSeverity(classifyRiskSeverity(score));

        RiskEntity saved = riskRepository.saveAndFlush(risk);

        String category = "Critical".equalsIgnoreCase(saved.getSeverity()) ? "Risk Escalation" : "Mutation";
        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("score", score);
        changes.put("severity", saved.getSeverity());
        changes.put("status", saved.getStatus());

        auditHistoryService.recordEvent(
                companyId,
                category,
                "Risk & Compliance",
                "Risk",
                saved.getId(),
                saved.getCode(),
                "Updated risk '" + saved.getCode() + "' (score " + score + " " + saved.getSeverity() + ", status " + saved.getStatus() + ")",
                currentUserId,
                userRole,
                ipAddress,
                changes
        );

        return serializeRisk(companyId, saved);
    }

    @Transactional
    public RiskOut escalateRisk(UUID companyId, UUID riskId, UUID currentUserId, String userRole, RiskEscalateRequest request, String ipAddress) {
        RiskEntity risk = riskRepository.findByIdAndCompanyId(riskId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Risk not found."));

        String target = (request.getEscalationTarget() != null && !request.getEscalationTarget().isBlank())
                ? request.getEscalationTarget().trim()
                : (risk.getEscalationTarget() != null ? risk.getEscalationTarget() : "Board Audit Committee");

        risk.setEscalationTarget(target);
        if ("Open".equalsIgnoreCase(risk.getStatus())) {
            risk.setStatus("In Review");
        }

        RiskEntity saved = riskRepository.saveAndFlush(risk);

        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("escalation_target", target);
        if (request.getNote() != null) changes.put("note", request.getNote());

        auditHistoryService.recordEvent(
                companyId,
                "Risk Escalation",
                "Risk & Compliance",
                "Risk",
                saved.getId(),
                saved.getCode(),
                "Escalated risk '" + saved.getCode() + "' to " + target,
                currentUserId,
                userRole,
                ipAddress,
                changes
        );

        return serializeRisk(companyId, saved);
    }

    public RiskOut serializeRisk(UUID companyId, RiskEntity r) {
        return serializeRisks(companyId, List.of(r)).get(0);
    }

    public List<RiskOut> serializeRisks(UUID companyId, List<RiskEntity> risks) {
        if (risks == null || risks.isEmpty()) {
            return Collections.emptyList();
        }

        List<UUID> riskIds = risks.stream().map(RiskEntity::getId).collect(Collectors.toList());
        Set<UUID> deptIds = risks.stream().map(RiskEntity::getDepartmentId).collect(Collectors.toSet());
        Set<UUID> ownerIds = risks.stream().map(RiskEntity::getOwnerUserId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> auditIds = risks.stream().map(RiskEntity::getLinkedAuditId).filter(Objects::nonNull).collect(Collectors.toSet());

        Map<UUID, DepartmentEntity> deptMap = departmentRepository.findAllById(deptIds).stream()
                .collect(Collectors.toMap(DepartmentEntity::getId, d -> d, (a, b) -> a));
        Map<UUID, UserEntity> ownerMap = ownerIds.isEmpty() ? Collections.emptyMap() :
                userRepository.findAllById(ownerIds).stream().collect(Collectors.toMap(UserEntity::getId, u -> u, (a, b) -> a));
        Map<UUID, AuditEntity> auditMap = auditIds.isEmpty() ? Collections.emptyMap() :
                auditRepository.findAllById(auditIds).stream().collect(Collectors.toMap(AuditEntity::getId, a -> a, (a, b) -> a));

        List<CorrectiveActionEntity> actionsList = correctiveActionRepository.findByRiskIdIn(riskIds);
        Map<UUID, List<CorrectiveActionEntity>> actionMap = new HashMap<>();
        for (CorrectiveActionEntity a : actionsList) {
            if (a.getRiskId() != null) {
                actionMap.computeIfAbsent(a.getRiskId(), k -> new ArrayList<>()).add(a);
            }
        }

        List<RiskOut> output = new ArrayList<>();
        for (RiskEntity r : risks) {
            DepartmentEntity dept = deptMap.get(r.getDepartmentId());
            UserEntity owner = r.getOwnerUserId() != null ? ownerMap.get(r.getOwnerUserId()) : null;
            AuditEntity audit = r.getLinkedAuditId() != null ? auditMap.get(r.getLinkedAuditId()) : null;

            int resProb = r.getResidualProbability() != null ? r.getResidualProbability() : r.getProbability();
            int resImp = r.getResidualImpact() != null ? r.getResidualImpact() : r.getImpact();
            int residualScore = resProb * resImp;
            String residualLevel = classifyRiskSeverity(residualScore);

            List<CorrectiveActionEntity> rActions = actionMap.getOrDefault(r.getId(), Collections.emptyList());
            int progressPct;
            if (!rActions.isEmpty()) {
                double avg = rActions.stream().mapToInt(CorrectiveActionEntity::getProgressPercent).average().orElse(0.0);
                progressPct = (int) Math.round(avg);
            } else {
                progressPct = "Mitigated".equalsIgnoreCase(r.getStatus()) ? 100 : ("In Review".equalsIgnoreCase(r.getStatus()) ? 80 : 40);
            }

            List<CorrectiveActionOut> actsOut = rActions.stream().map(a -> {
                CorrectiveActionOut ao = new CorrectiveActionOut();
                ao.setId(a.getId());
                ao.setCompanyId(a.getCompanyId());
                ao.setRiskId(a.getRiskId());
                ao.setRiskCode(r.getCode());
                ao.setCode(a.getCode());
                ao.setStepOrder(a.getStepOrder());
                ao.setTitle(a.getTitle());
                ao.setDetail(a.getDetail());
                ao.setStatus(a.getStatus());
                ao.setProgressPercent(a.getProgressPercent());
                ao.setDueDate(a.getDueDate());
                ao.setCompletedAt(a.getCompletedAt());
                ao.setVerifiedAt(a.getVerifiedAt());
                ao.setCreatedAt(a.getCreatedAt());
                ao.setUpdatedAt(a.getUpdatedAt());
                return ao;
            }).collect(Collectors.toList());

            List<RiskFrameworkItem> frameworks = new ArrayList<>();
            if (r.getMappedFrameworks() != null && !r.getMappedFrameworks().isBlank()) {
                try {
                    frameworks = objectMapper.readValue(r.getMappedFrameworks(), new TypeReference<List<RiskFrameworkItem>>() {});
                } catch (Exception ignored) {}
            }

            RiskOut ro = new RiskOut();
            ro.setId(r.getId());
            ro.setCompanyId(r.getCompanyId());
            ro.setDepartmentId(r.getDepartmentId());
            ro.setDepartmentName(dept != null ? dept.getName() : "Unknown");
            ro.setDepartmentCode(dept != null ? dept.getCode() : "N/A");
            ro.setOwnerUserId(r.getOwnerUserId());
            ro.setOwnerName(owner != null ? owner.getFullName() : "Unassigned");
            ro.setOwnerInitials(owner != null ? FindingService.computeInitials(owner.getFullName()) : "UA");
            ro.setOwnerRole(owner != null && owner.getJobTitle() != null ? owner.getJobTitle() : "Risk Owner");
            ro.setLinkedAuditId(r.getLinkedAuditId());
            ro.setLinkedAuditCode(audit != null ? audit.getCode() : null);
            ro.setCode(r.getCode());
            ro.setTitle(r.getTitle());
            ro.setScopeDescription(r.getScopeDescription());
            ro.setCategory(r.getCategory());
            ro.setProbability(r.getProbability());
            ro.setImpact(r.getImpact());
            ro.setInherentScore(r.getInherentScore());
            ro.setSeverity(r.getSeverity());
            ro.setResidualProbability(r.getResidualProbability());
            ro.setResidualImpact(r.getResidualImpact());
            ro.setResidualScore(residualScore);
            ro.setResidualLevel(residualLevel);
            ro.setMitigationStrategy(r.getMitigationStrategy());
            ro.setNarrative(r.getNarrative());
            ro.setAffectedAssets(r.getAffectedAssets() != null ? r.getAffectedAssets() : Collections.emptyList());
            ro.setMappedFrameworks(frameworks);
            ro.setEscalationTarget(r.getEscalationTarget());
            ro.setNextReviewDate(r.getNextReviewDate());
            ro.setStatus(r.getStatus());
            ro.setProgressPercent(progressPct);
            ro.setCorrectiveActions(actsOut);
            ro.setCreatedAt(r.getCreatedAt());
            ro.setUpdatedAt(r.getUpdatedAt());

            output.add(ro);
        }

        return output;
    }

    public String generateNextRiskCode(UUID companyId) {
        List<RiskEntity> existing = riskRepository.findByCompanyId(companyId);
        int maxNum = 40;
        Pattern pattern = Pattern.compile("^RSK-(\\d+)$");
        for (RiskEntity r : existing) {
            if (r.getCode() != null) {
                Matcher m = pattern.matcher(r.getCode());
                if (m.matches()) {
                    try {
                        int num = Integer.parseInt(m.group(1));
                        if (num > maxNum) maxNum = num;
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        return "RSK-" + (maxNum + 1);
    }
}
