package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.*;
import io.companyaudit.platform.dto.request.FindingCreate;
import io.companyaudit.platform.dto.request.FindingUpdate;
import io.companyaudit.platform.dto.request.RecommendationCreate;
import io.companyaudit.platform.dto.request.RecommendationRespondRequest;
import io.companyaudit.platform.dto.response.*;
import io.companyaudit.platform.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class FindingService {

    private final FindingRepository findingRepository;
    private final AuditRepository auditRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final RecommendationRepository recommendationRepository;
    private final CorrectiveActionRepository correctiveActionRepository;
    private final EvidenceRepository evidenceRepository;
    private final AuditHistoryService auditHistoryService;

    public FindingService(FindingRepository findingRepository,
                          AuditRepository auditRepository,
                          DepartmentRepository departmentRepository,
                          UserRepository userRepository,
                          RecommendationRepository recommendationRepository,
                          CorrectiveActionRepository correctiveActionRepository,
                          EvidenceRepository evidenceRepository,
                          AuditHistoryService auditHistoryService) {
        this.findingRepository = findingRepository;
        this.auditRepository = auditRepository;
        this.departmentRepository = departmentRepository;
        this.userRepository = userRepository;
        this.recommendationRepository = recommendationRepository;
        this.correctiveActionRepository = correctiveActionRepository;
        this.evidenceRepository = evidenceRepository;
        this.auditHistoryService = auditHistoryService;
    }

    @Transactional(readOnly = true)
    public PaginatedResponse<FindingOut> listFindings(UUID companyId,
                                                      String severity,
                                                      String status,
                                                      UUID departmentId,
                                                      UUID auditId,
                                                      String search,
                                                      int limit,
                                                      int offset) {
        List<FindingEntity> all = findingRepository.findByCompanyIdOrderByTargetSlaDateAsc(companyId);

        List<FindingEntity> filtered = all.stream().filter(f -> {
            if (severity != null && !severity.isBlank() && !severity.equalsIgnoreCase(f.getSeverity())) {
                return false;
            }
            if (status != null && !status.isBlank() && !status.equalsIgnoreCase(f.getStatus())) {
                return false;
            }
            if (departmentId != null && !departmentId.equals(f.getDepartmentId())) {
                return false;
            }
            if (auditId != null && !auditId.equals(f.getAuditId())) {
                return false;
            }
            if (search != null && !search.trim().isEmpty()) {
                String term = search.trim().toLowerCase(Locale.ROOT);
                boolean matchCode = f.getCode() != null && f.getCode().toLowerCase(Locale.ROOT).contains(term);
                boolean matchTitle = f.getTitle() != null && f.getTitle().toLowerCase(Locale.ROOT).contains(term);
                boolean matchRoot = f.getRootCause() != null && f.getRootCause().toLowerCase(Locale.ROOT).contains(term);
                if (!matchCode && !matchTitle && !matchRoot) {
                    return false;
                }
            }
            return true;
        }).collect(Collectors.toList());

        int total = filtered.size();
        int fromIndex = Math.min(offset, total);
        int toIndex = Math.min(fromIndex + limit, total);
        List<FindingEntity> paged = filtered.subList(fromIndex, toIndex);

        List<FindingOut> items = serializeFindings(companyId, paged);
        return new PaginatedResponse<>(items, (long) total, offset / Math.max(1, limit) + 1, limit);
    }

    @Transactional(readOnly = true)
    public FindingOut getFinding(UUID companyId, UUID findingId) {
        FindingEntity finding = findingRepository.findByIdAndCompanyId(findingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Finding not found."));
        return serializeFinding(companyId, finding);
    }

    @Transactional
    public FindingOut createFinding(UUID companyId, UUID currentUserId, String userRole, FindingCreate request, String ipAddress) {
        AuditEntity audit = auditRepository.findByIdAndCompanyId(request.getAuditId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit not found."));

        DepartmentEntity dept = departmentRepository.findById(request.getDepartmentId())
                .filter(d -> companyId.equals(d.getCompanyId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found."));

        String code;
        if (request.getCode() != null && !request.getCode().isBlank()) {
            code = request.getCode().trim().toUpperCase(Locale.ROOT);
        } else {
            code = generateNextFindingCode(companyId);
        }

        if (findingRepository.existsByCompanyIdAndCode(companyId, code)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Finding code '" + code + "' already exists.");
        }

        FindingEntity finding = new FindingEntity();
        finding.setCompanyId(companyId);
        finding.setAuditId(request.getAuditId());
        finding.setAuditResponseId(request.getAuditResponseId());
        finding.setDepartmentId(request.getDepartmentId());
        finding.setOwnerUserId(request.getOwnerUserId() != null ? request.getOwnerUserId() : dept.getHeadUserId());
        finding.setLeadAuditorId(request.getLeadAuditorId() != null ? request.getLeadAuditorId() : currentUserId);
        finding.setCode(code);
        finding.setTitle(request.getTitle().trim());
        finding.setRootCause(request.getRootCause().trim());
        finding.setWorkstream(request.getWorkstream());
        finding.setSeverity(request.getSeverity());
        finding.setStatus(request.getStatus() != null ? request.getStatus() : "Open");
        finding.setTargetSlaDate(request.getTargetSlaDate());
        finding.setManagementResponse(request.getManagementResponse());

        FindingEntity saved = findingRepository.saveAndFlush(finding);

        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("severity", saved.getSeverity());
        changes.put("target_sla_date", saved.getTargetSlaDate().toString());

        auditHistoryService.recordEvent(
                companyId,
                "Mutation",
                "Findings & Actions",
                "Finding",
                saved.getId(),
                saved.getCode(),
                "Raised " + saved.getSeverity() + " audit finding '" + saved.getTitle() + "'",
                currentUserId,
                userRole,
                ipAddress,
                changes
        );

        return serializeFinding(companyId, saved);
    }

    @Transactional
    public FindingOut updateFinding(UUID companyId, UUID findingId, UUID currentUserId, String userRole, UUID currentUserDeptId, FindingUpdate request, String ipAddress) {
        FindingEntity finding = findingRepository.findByIdAndCompanyId(findingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Finding not found."));

        String prevStatus = finding.getStatus();

        if ("Department Head".equalsIgnoreCase(userRole)) {
            if (currentUserDeptId != null && !currentUserDeptId.equals(finding.getDepartmentId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Department Heads can only modify findings within their own department.");
            }
            if (request.getTitle() != null || request.getRootCause() != null || request.getSeverity() != null || request.getWorkstream() != null || request.getOwnerUserId() != null || request.getTargetSlaDate() != null) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Department Heads can only submit management_response or mark a department finding Verification Pending.");
            }
            if (request.getStatus() != null && !"Verification Pending".equalsIgnoreCase(request.getStatus())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Department Heads can only submit management_response or mark a department finding Verification Pending.");
            }
        } else if ("Management".equalsIgnoreCase(userRole)) {
            if (request.getTitle() != null || request.getRootCause() != null || request.getSeverity() != null || request.getWorkstream() != null || request.getOwnerUserId() != null || request.getTargetSlaDate() != null) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Management role can only submit responses, approve sign-off, or reject verification back to In Progress.");
            }
            if (request.getStatus() != null && !Set.of("Closed", "In Progress", "Open").contains(request.getStatus())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Management role can only submit responses, approve sign-off, or reject verification back to In Progress.");
            }
        }

        boolean isRejection = "Verification Pending".equalsIgnoreCase(prevStatus)
                && request.getStatus() != null
                && Set.of("In Progress", "Open").contains(request.getStatus())
                && !Boolean.TRUE.equals(request.getSignOff());

        if (isRejection) {
            String reason = request.getRejectionReason() != null ? request.getRejectionReason().trim() : "";
            if (reason.length() < 3) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "A clear rejection_reason (min 3 characters) is required when rejecting verification.");
            }
            finding.setRejectionReason(reason);
            finding.setSignedOffById(null);
            finding.setSignedOffAt(null);
        }

        if (Boolean.TRUE.equals(request.getSignOff()) || "Closed".equalsIgnoreCase(request.getStatus())) {
            finding.setSignedOffById(currentUserId);
            finding.setSignedOffAt(OffsetDateTime.now());
            finding.setStatus("Closed");
            finding.setRejectionReason(null);
        } else if (request.getStatus() != null) {
            finding.setStatus(request.getStatus());
        }

        if (request.getTitle() != null) finding.setTitle(request.getTitle().trim());
        if (request.getRootCause() != null) finding.setRootCause(request.getRootCause().trim());
        if (request.getWorkstream() != null) finding.setWorkstream(request.getWorkstream());
        if (request.getSeverity() != null) finding.setSeverity(request.getSeverity());
        if (request.getOwnerUserId() != null) finding.setOwnerUserId(request.getOwnerUserId());
        if (request.getTargetSlaDate() != null) finding.setTargetSlaDate(request.getTargetSlaDate());
        if (request.getManagementResponse() != null) finding.setManagementResponse(request.getManagementResponse().trim());

        FindingEntity saved = findingRepository.saveAndFlush(finding);

        String category = "Closed".equalsIgnoreCase(saved.getStatus()) ? "Sign-Off" : "Mutation";
        String actionMsg = isRejection ?
                "Rejected verification & reopened finding '" + saved.getCode() + "' -> " + saved.getStatus() :
                "Updated finding '" + saved.getCode() + "' (status: " + saved.getStatus() + ")";

        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("status", saved.getStatus());
        if (saved.getSeverity() != null) changes.put("severity", saved.getSeverity());

        auditHistoryService.recordEvent(
                companyId,
                category,
                "Findings & Actions",
                "Finding",
                saved.getId(),
                saved.getCode(),
                actionMsg,
                currentUserId,
                userRole,
                ipAddress,
                changes
        );

        return serializeFinding(companyId, saved);
    }

    @Transactional
    public MessageResponse deleteFinding(UUID companyId, UUID findingId, UUID currentUserId, String userRole, String ipAddress) {
        FindingEntity finding = findingRepository.findByIdAndCompanyId(findingId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Finding not found."));

        if ("Closed".equalsIgnoreCase(finding.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Closed findings have signed-off records and cannot be deleted.");
        }

        String code = finding.getCode();
        String title = finding.getTitle();

        findingRepository.delete(finding);
        findingRepository.flush();

        auditHistoryService.recordEvent(
                companyId,
                "Mutation",
                "Findings & Actions",
                "Finding",
                findingId,
                code,
                "Deleted non-closed finding '" + code + ": " + title + "'",
                currentUserId,
                userRole,
                ipAddress,
                Collections.emptyMap()
        );

        return new MessageResponse("Finding '" + code + "' deleted.");
    }

    @Transactional
    public RecommendationOut createRecommendation(UUID companyId, UUID currentUserId, String userRole, RecommendationCreate request, String ipAddress) {
        FindingEntity finding = findingRepository.findByIdAndCompanyId(request.getFindingId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Finding not found."));

        RecommendationEntity rec = new RecommendationEntity();
        rec.setCompanyId(companyId);
        rec.setFindingId(request.getFindingId());
        rec.setRiskId(request.getRiskId());
        rec.setAuthorUserId(currentUserId);
        rec.setTitle(request.getTitle().trim());
        rec.setGuidance(request.getGuidance().trim());
        rec.setPriority(request.getPriority() != null ? request.getPriority() : "High");

        RecommendationEntity saved = recommendationRepository.saveAndFlush(rec);

        auditHistoryService.recordEvent(
                companyId,
                "Mutation",
                "Findings & Actions",
                "Recommendation",
                saved.getId(),
                finding.getCode(),
                "Issued recommendation '" + saved.getTitle() + "' on finding " + finding.getCode(),
                currentUserId,
                userRole,
                ipAddress,
                Collections.emptyMap()
        );

        UserEntity author = userRepository.findById(currentUserId).orElse(null);
        return mapRecommendationToOut(saved, author != null ? author.getFullName() : null);
    }

    @Transactional
    public RecommendationOut respondRecommendation(UUID companyId, UUID currentUserId, String userRole, UUID currentUserDeptId, UUID recommendationId, RecommendationRespondRequest request, String ipAddress) {
        RecommendationEntity rec = recommendationRepository.findByIdAndCompanyId(recommendationId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recommendation not found."));

        if ("Department Head".equalsIgnoreCase(userRole)) {
            FindingEntity finding = findingRepository.findByIdAndCompanyId(rec.getFindingId(), companyId).orElse(null);
            if (finding != null && currentUserDeptId != null && !currentUserDeptId.equals(finding.getDepartmentId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Department Heads can only respond to recommendations in their department.");
            }
        }

        rec.setManagementResponse(request.getManagementResponse().trim());
        rec.setAcceptedByManagement(Boolean.TRUE.equals(request.getAcceptedByManagement()));
        rec.setAcceptedAt(Boolean.TRUE.equals(request.getAcceptedByManagement()) ? OffsetDateTime.now() : null);

        RecommendationEntity saved = recommendationRepository.saveAndFlush(rec);

        auditHistoryService.recordEvent(
                companyId,
                "Mutation",
                "Findings & Actions",
                "Recommendation",
                saved.getId(),
                saved.getId().toString(),
                "Submitted management response (" + (Boolean.TRUE.equals(saved.getAcceptedByManagement()) ? "Accepted" : "Pending") + ")",
                currentUserId,
                userRole,
                ipAddress,
                Collections.emptyMap()
        );

        UserEntity author = rec.getAuthorUserId() != null ? userRepository.findById(rec.getAuthorUserId()).orElse(null) : null;
        return mapRecommendationToOut(saved, author != null ? author.getFullName() : null);
    }

    public FindingOut serializeFinding(UUID companyId, FindingEntity f) {
        return serializeFindings(companyId, List.of(f)).get(0);
    }

    public List<FindingOut> serializeFindings(UUID companyId, List<FindingEntity> findings) {
        if (findings == null || findings.isEmpty()) {
            return Collections.emptyList();
        }

        List<UUID> findingIds = findings.stream().map(FindingEntity::getId).collect(Collectors.toList());
        Set<UUID> auditIds = findings.stream().map(FindingEntity::getAuditId).collect(Collectors.toSet());
        Set<UUID> deptIds = findings.stream().map(FindingEntity::getDepartmentId).collect(Collectors.toSet());
        Set<UUID> userIds = new HashSet<>();
        for (FindingEntity f : findings) {
            if (f.getOwnerUserId() != null) userIds.add(f.getOwnerUserId());
            if (f.getLeadAuditorId() != null) userIds.add(f.getLeadAuditorId());
            if (f.getSignedOffById() != null) userIds.add(f.getSignedOffById());
        }

        Map<UUID, AuditEntity> auditMap = auditRepository.findAllById(auditIds).stream()
                .collect(Collectors.toMap(AuditEntity::getId, a -> a, (a, b) -> a));
        Map<UUID, DepartmentEntity> deptMap = departmentRepository.findAllById(deptIds).stream()
                .collect(Collectors.toMap(DepartmentEntity::getId, d -> d, (a, b) -> a));
        Map<UUID, UserEntity> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(UserEntity::getId, u -> u, (a, b) -> a));

        List<EvidenceEntity> evidenceList = evidenceRepository.findByFindingIdInOrderByCreatedAtDesc(findingIds);
        Map<UUID, List<EvidenceEntity>> evMap = new HashMap<>();
        for (EvidenceEntity ev : evidenceList) {
            if (ev.getFindingId() != null) {
                evMap.computeIfAbsent(ev.getFindingId(), k -> new ArrayList<>()).add(ev);
            }
        }

        List<CorrectiveActionEntity> actionsList = correctiveActionRepository.findByFindingIdIn(findingIds);
        Map<UUID, List<CorrectiveActionEntity>> actionMap = new HashMap<>();
        for (CorrectiveActionEntity a : actionsList) {
            if (a.getFindingId() != null) {
                actionMap.computeIfAbsent(a.getFindingId(), k -> new ArrayList<>()).add(a);
            }
        }

        List<FindingOut> output = new ArrayList<>();
        LocalDate today = LocalDate.now();

        for (FindingEntity f : findings) {
            AuditEntity audit = auditMap.get(f.getAuditId());
            DepartmentEntity dept = deptMap.get(f.getDepartmentId());
            UserEntity owner = f.getOwnerUserId() != null ? userMap.get(f.getOwnerUserId()) : null;
            UserEntity lead = f.getLeadAuditorId() != null ? userMap.get(f.getLeadAuditorId()) : null;
            UserEntity signer = f.getSignedOffById() != null ? userMap.get(f.getSignedOffById()) : null;

            SlaResult sla = computeSlaCountdown(f.getTargetSlaDate(), f.getStatus(), today);

            List<CorrectiveActionEntity> fActions = actionMap.getOrDefault(f.getId(), Collections.emptyList());
            int progressPct;
            if (!fActions.isEmpty()) {
                double avg = fActions.stream().mapToInt(CorrectiveActionEntity::getProgressPercent).average().orElse(0.0);
                progressPct = (int) Math.round(avg);
            } else {
                progressPct = "Closed".equalsIgnoreCase(f.getStatus()) ? 100 : ("Verification Pending".equalsIgnoreCase(f.getStatus()) ? 90 : 0);
            }

            List<RecommendationOut> recsOut = recommendationRepository.findByCompanyIdAndFindingIdOrderByCreatedAtAsc(companyId, f.getId())
                    .stream().map(r -> {
                        UserEntity a = r.getAuthorUserId() != null ? userRepository.findById(r.getAuthorUserId()).orElse(null) : null;
                        return mapRecommendationToOut(r, a != null ? a.getFullName() : null);
                    }).collect(Collectors.toList());

            List<CorrectiveActionOut> actsOut = fActions.stream().map(a -> {
                CorrectiveActionOut ao = new CorrectiveActionOut();
                ao.setId(a.getId());
                ao.setCompanyId(a.getCompanyId());
                ao.setFindingId(a.getFindingId());
                ao.setFindingCode(f.getCode());
                ao.setFindingTitle(f.getTitle());
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

            List<FindingEvidenceRefOut> evOut = evMap.getOrDefault(f.getId(), Collections.emptyList()).stream().map(e -> {
                FindingEvidenceRefOut eo = new FindingEvidenceRefOut();
                eo.setId(e.getId());
                eo.setCode(e.getCode());
                eo.setFilename(e.getOriginalFilename());
                eo.setMimeType(e.getMimeType());
                eo.setByteSize(e.getByteSize());
                eo.setSha256Hash(e.getSha256Hash());
                eo.setVerificationStatus(e.getVerificationStatus());
                eo.setTag(e.getTag());
                return eo;
            }).collect(Collectors.toList());

            FindingOut fo = new FindingOut();
            fo.setId(f.getId());
            fo.setCompanyId(f.getCompanyId());
            fo.setAuditId(f.getAuditId());
            fo.setAuditCode(audit != null ? audit.getCode() : "N/A");
            fo.setAuditTitle(audit != null ? audit.getTitle() : "Audit Engagement");
            fo.setAuditResponseId(f.getAuditResponseId());
            fo.setDepartmentId(f.getDepartmentId());
            fo.setDepartmentName(dept != null ? dept.getName() : "Unknown");
            fo.setDepartmentCode(dept != null ? dept.getCode() : "N/A");
            fo.setOwnerUserId(f.getOwnerUserId());
            fo.setOwnerName(owner != null ? owner.getFullName() : "Unassigned");
            fo.setOwnerInitials(owner != null ? computeInitials(owner.getFullName()) : "UA");
            fo.setLeadAuditorId(f.getLeadAuditorId());
            fo.setLeadAuditorName(lead != null ? lead.getFullName() : "Unassigned");
            fo.setSignedOffById(f.getSignedOffById());
            fo.setSignedOffByName(signer != null ? signer.getFullName() : null);
            fo.setCode(f.getCode());
            fo.setTitle(f.getTitle());
            fo.setRootCause(f.getRootCause());
            fo.setWorkstream(f.getWorkstream());
            fo.setSeverity(f.getSeverity());
            fo.setStatus(f.getStatus());
            fo.setTargetSlaDate(f.getTargetSlaDate());
            fo.setSlaCountdown(sla.countdown);
            fo.setIsOverdue(sla.isOverdue);
            fo.setProgressPercent(progressPct);
            fo.setManagementResponse(f.getManagementResponse());
            fo.setRejectionReason(f.getRejectionReason());
            fo.setSignedOffAt(f.getSignedOffAt());
            fo.setRecommendations(recsOut);
            fo.setCorrectiveActions(actsOut);
            fo.setEvidenceItems(evOut);
            fo.setCreatedAt(f.getCreatedAt());
            fo.setUpdatedAt(f.getUpdatedAt());

            output.add(fo);
        }

        return output;
    }

    private RecommendationOut mapRecommendationToOut(RecommendationEntity r, String authorName) {
        RecommendationOut ro = new RecommendationOut();
        ro.setId(r.getId());
        ro.setFindingId(r.getFindingId());
        ro.setRiskId(r.getRiskId());
        ro.setAuthorUserId(r.getAuthorUserId());
        ro.setAuthorName(authorName);
        ro.setTitle(r.getTitle());
        ro.setGuidance(r.getGuidance());
        ro.setPriority(r.getPriority());
        ro.setManagementResponse(r.getManagementResponse());
        ro.setAcceptedByManagement(r.getAcceptedByManagement());
        ro.setAcceptedAt(r.getAcceptedAt());
        ro.setCreatedAt(r.getCreatedAt());
        ro.setUpdatedAt(r.getUpdatedAt());
        return ro;
    }

    public static String computeInitials(String fullName) {
        if (fullName == null || fullName.trim().isEmpty()) {
            return "UA";
        }
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length == 1) {
            return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase(Locale.ROOT);
        }
        return (parts[0].substring(0, 1) + parts[parts.length - 1].substring(0, 1)).toUpperCase(Locale.ROOT);
    }

    public static SlaResult computeSlaCountdown(LocalDate targetSlaDate, String status, LocalDate today) {
        if ("Closed".equalsIgnoreCase(status)) {
            return new SlaResult("Resolved", false);
        }
        if ("Verification Pending".equalsIgnoreCase(status)) {
            return new SlaResult("Pending Sign-off", false);
        }
        if (targetSlaDate == null) {
            return new SlaResult("No SLA", false);
        }
        long deltaDays = ChronoUnit.DAYS.between(today, targetSlaDate);
        if (deltaDays < 0) {
            return new SlaResult("Overdue " + Math.abs(deltaDays) + "d", true);
        }
        if (deltaDays == 0) {
            return new SlaResult("Due Today", false);
        }
        return new SlaResult("In " + deltaDays + " Days", false);
    }

    public String generateNextFindingCode(UUID companyId) {
        List<FindingEntity> existing = findingRepository.findByCompanyId(companyId);
        int maxNum = 1030;
        Pattern pattern = Pattern.compile("^FND-(\\d+)$");
        for (FindingEntity f : existing) {
            if (f.getCode() != null) {
                Matcher m = pattern.matcher(f.getCode());
                if (m.matches()) {
                    try {
                        int num = Integer.parseInt(m.group(1));
                        if (num > maxNum) maxNum = num;
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        return "FND-" + (maxNum + 1);
    }

    public static class SlaResult {
        public final String countdown;
        public final boolean isOverdue;

        public SlaResult(String countdown, boolean isOverdue) {
            this.countdown = countdown;
            this.isOverdue = isOverdue;
        }
    }
}
