package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.*;
import io.companyaudit.platform.dto.request.*;
import io.companyaudit.platform.dto.response.*;
import io.companyaudit.platform.repository.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class AuditService {

    private final AuditRepository auditRepository;
    private final AuditScopeRepository auditScopeRepository;
    private final AuditResponseRepository auditResponseRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final ChecklistRepository checklistRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final FindingRepository findingRepository;
    private final AuditScoringService auditScoringService;
    private final AuditHistoryService auditHistoryService;

    public AuditService(
            AuditRepository auditRepository,
            AuditScopeRepository auditScopeRepository,
            AuditResponseRepository auditResponseRepository,
            DepartmentRepository departmentRepository,
            UserRepository userRepository,
            ChecklistRepository checklistRepository,
            ChecklistItemRepository checklistItemRepository,
            FindingRepository findingRepository,
            AuditScoringService auditScoringService,
            AuditHistoryService auditHistoryService
    ) {
        this.auditRepository = auditRepository;
        this.auditScopeRepository = auditScopeRepository;
        this.auditResponseRepository = auditResponseRepository;
        this.departmentRepository = departmentRepository;
        this.userRepository = userRepository;
        this.checklistRepository = checklistRepository;
        this.checklistItemRepository = checklistItemRepository;
        this.findingRepository = findingRepository;
        this.auditScoringService = auditScoringService;
        this.auditHistoryService = auditHistoryService;
    }

    @Transactional(readOnly = true)
    public PaginatedResponse<AuditOut> listAudits(
            UUID companyId,
            String domain,
            String statusFilter,
            UUID departmentId,
            String search,
            int limit,
            int offset
    ) {
        Specification<AuditEntity> spec = (root, query, cb) -> {
            var predicates = new ArrayList<jakarta.persistence.criteria.Predicate>();
            predicates.add(cb.equal(root.get("companyId"), companyId));

            if (domain != null && !domain.isBlank()) {
                predicates.add(cb.equal(root.get("domain"), domain.trim()));
            }
            if (statusFilter != null && !statusFilter.isBlank()) {
                predicates.add(cb.equal(root.get("status"), statusFilter.trim()));
            }
            if (departmentId != null) {
                predicates.add(cb.equal(root.get("departmentId"), departmentId));
            }
            if (search != null && !search.isBlank()) {
                String pattern = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("code")), pattern),
                        cb.like(cb.lower(root.get("title")), pattern),
                        cb.like(cb.lower(root.get("framework")), pattern)
                ));
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };

        int pageNumber = offset / Math.max(1, limit);
        Pageable pageable = PageRequest.of(pageNumber, limit, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<AuditEntity> page = auditRepository.findAll(spec, pageable);

        List<AuditOut> items = serializeAudits(companyId, page.getContent());
        return new PaginatedResponse<>(items, page.getTotalElements(), limit, offset);
    }

    @Transactional(readOnly = true)
    public AuditOut getAudit(UUID companyId, UUID auditId) {
        AuditEntity audit = auditRepository.findByIdAndCompanyId(auditId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit not found."));
        return serializeAudit(companyId, audit);
    }

    @Transactional
    public AuditOut createAudit(UUID companyId, UUID currentUserId, AuditCreate payload, String ipAddress) {
        DepartmentEntity dept = departmentRepository.findById(payload.getDepartmentId())
                .filter(d -> d.getCompanyId().equals(companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found."));

        UserEntity leadAuditor = null;
        if (payload.getLeadAuditorId() != null) {
            leadAuditor = userRepository.findById(payload.getLeadAuditorId())
                    .filter(u -> u.getCompanyId().equals(companyId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lead auditor user not found."));
        }

        UserEntity currentUser = userRepository.findById(currentUserId).orElse(null);

        String auditCode;
        if (payload.getCode() != null && !payload.getCode().isBlank()) {
            auditCode = payload.getCode().trim().toUpperCase();
        } else {
            int year = LocalDate.now().getYear();
            auditCode = generateNextCode(companyId, "AUD-" + year + "-", 111, 3);
        }

        if (auditRepository.existsByCompanyIdAndCode(companyId, auditCode)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Audit code '" + auditCode + "' already exists.");
        }

        AuditEntity audit = new AuditEntity();
        audit.setCompanyId(companyId);
        audit.setDepartmentId(dept.getId());
        audit.setLeadAuditorId(leadAuditor != null ? leadAuditor.getId() : currentUserId);
        audit.setCreatedById(currentUserId);
        audit.setCode(auditCode);
        audit.setTitle(payload.getTitle().trim());
        audit.setDomain(payload.getDomain().trim());
        audit.setFramework(payload.getFramework().trim());
        audit.setStatus(payload.getStatus() != null ? payload.getStatus() : "Draft");
        audit.setScheduledStart(payload.getScheduledStart());
        audit.setTargetDueDate(payload.getTargetDueDate());
        audit.setSummary(payload.getSummary());

        audit = auditRepository.saveAndFlush(audit);

        if (payload.getScopes() != null && !payload.getScopes().isEmpty()) {
            for (AuditScopeCreate scopeIn : payload.getScopes()) {
                AuditScopeEntity scope = new AuditScopeEntity();
                scope.setCompanyId(companyId);
                scope.setAuditId(audit.getId());
                scope.setScopeName(scopeIn.getScopeName().trim());
                scope.setSystemOrProcess(scopeIn.getSystemOrProcess().trim());
                scope.setRegulatoryClause(scopeIn.getRegulatoryClause() != null ? scopeIn.getRegulatoryClause().trim() : null);
                scope.setInScope(Boolean.TRUE.equals(scopeIn.getInScope()));
                auditScopeRepository.save(scope);
                audit.getScopes().add(scope);
            }
        }

        Map<String, Object> changes = new HashMap<>();
        changes.put("status", audit.getStatus());
        changes.put("framework", audit.getFramework());

        auditHistoryService.recordAuditHistory(
                companyId,
                currentUser,
                "Mutation",
                "Audit Management",
                "Audit",
                audit.getId(),
                audit.getCode(),
                "Scheduled " + audit.getDomain() + " audit engagement '" + audit.getTitle() + "'",
                changes,
                ipAddress
        );

        return serializeAudit(companyId, audit);
    }

    @Transactional
    public AuditOut updateAudit(UUID companyId, UUID auditId, UUID currentUserId, AuditUpdate payload, String ipAddress) {
        AuditEntity audit = auditRepository.findByIdAndCompanyId(auditId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit not found."));

        UserEntity currentUser = userRepository.findById(currentUserId).orElse(null);
        Map<String, Object> updateData = new HashMap<>();

        if (payload.getDepartmentId() != null) {
            DepartmentEntity dept = departmentRepository.findById(payload.getDepartmentId())
                    .filter(d -> d.getCompanyId().equals(companyId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found."));
            audit.setDepartmentId(dept.getId());
            updateData.put("department_id", dept.getId());
        }

        if (payload.getLeadAuditorId() != null) {
            UserEntity lead = userRepository.findById(payload.getLeadAuditorId())
                    .filter(u -> u.getCompanyId().equals(companyId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Lead auditor not found."));
            audit.setLeadAuditorId(lead.getId());
            updateData.put("lead_auditor_id", lead.getId());
        }

        if (payload.getTitle() != null && !payload.getTitle().isBlank()) {
            audit.setTitle(payload.getTitle().trim());
            updateData.put("title", audit.getTitle());
        }

        if (payload.getFramework() != null && !payload.getFramework().isBlank()) {
            audit.setFramework(payload.getFramework().trim());
            updateData.put("framework", audit.getFramework());
        }

        if (payload.getScheduledStart() != null) {
            audit.setScheduledStart(payload.getScheduledStart());
            updateData.put("scheduled_start", audit.getScheduledStart());
        }

        if (payload.getTargetDueDate() != null) {
            audit.setTargetDueDate(payload.getTargetDueDate());
            updateData.put("target_due_date", audit.getTargetDueDate());
        }

        if (payload.getSummary() != null) {
            audit.setSummary(payload.getSummary());
            updateData.put("summary", audit.getSummary());
        }

        if (payload.getStatus() != null && !payload.getStatus().isBlank()) {
            String targetStatus = payload.getStatus().trim();
            long openFindingsCount = findingRepository.countByAuditIdAndStatusNot(audit.getId(), "Closed");
            try {
                auditScoringService.validateAuditStatusTransition(audit, targetStatus, openFindingsCount);
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
            }

            if ("Closed".equals(targetStatus) && audit.getCompletedAt() == null) {
                audit.setCompletedAt(OffsetDateTime.now());
            }
            audit.setStatus(targetStatus);
            updateData.put("status", targetStatus);
        }

        audit = auditRepository.saveAndFlush(audit);

        String category = "Closed".equals(updateData.get("status")) ? "Sign-Off" : "Mutation";
        auditHistoryService.recordAuditHistory(
                companyId,
                currentUser,
                category,
                "Audit Management",
                "Audit",
                audit.getId(),
                audit.getCode(),
                "Updated audit '" + audit.getTitle() + "'" + (updateData.containsKey("status") ? " -> status '" + audit.getStatus() + "'" : ""),
                updateData,
                ipAddress
        );

        return serializeAudit(companyId, audit);
    }

    @Transactional
    public AuditScopeOut addScope(UUID companyId, UUID auditId, UUID currentUserId, AuditScopeCreate payload, String ipAddress) {
        AuditEntity audit = auditRepository.findByIdAndCompanyId(auditId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit not found."));

        if ("Closed".equals(audit.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Closed audits are locked; scopes cannot be modified.");
        }

        UserEntity currentUser = userRepository.findById(currentUserId).orElse(null);

        AuditScopeEntity scope = new AuditScopeEntity();
        scope.setCompanyId(companyId);
        scope.setAuditId(audit.getId());
        scope.setScopeName(payload.getScopeName().trim());
        scope.setSystemOrProcess(payload.getSystemOrProcess().trim());
        scope.setRegulatoryClause(payload.getRegulatoryClause() != null ? payload.getRegulatoryClause().trim() : null);
        scope.setInScope(Boolean.TRUE.equals(payload.getInScope()));

        scope = auditScopeRepository.save(scope);

        Map<String, Object> changes = Map.of(
                "scope_name", scope.getScopeName(),
                "in_scope", scope.getInScope()
        );

        auditHistoryService.recordAuditHistory(
                companyId,
                currentUser,
                "Mutation",
                "Audit Management",
                "Audit",
                audit.getId(),
                audit.getCode(),
                "Added audit scope '" + scope.getScopeName() + "'",
                changes,
                ipAddress
        );

        return new AuditScopeOut(scope.getId(), scope.getAuditId(), scope.getScopeName(), scope.getSystemOrProcess(), scope.getRegulatoryClause(), scope.getInScope());
    }

    @Transactional
    public AuditScopeOut updateScope(UUID companyId, UUID auditId, UUID scopeId, UUID currentUserId, AuditScopeUpdate payload, String ipAddress) {
        AuditEntity audit = auditRepository.findByIdAndCompanyId(auditId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit not found."));

        if ("Closed".equals(audit.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Closed audits are locked; scopes cannot be modified.");
        }

        AuditScopeEntity scope = auditScopeRepository.findByIdAndAuditIdAndCompanyId(scopeId, auditId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit scope not found."));

        UserEntity currentUser = userRepository.findById(currentUserId).orElse(null);
        Map<String, Object> changes = new HashMap<>();

        if (payload.getScopeName() != null && !payload.getScopeName().isBlank()) {
            scope.setScopeName(payload.getScopeName().trim());
            changes.put("scope_name", scope.getScopeName());
        }
        if (payload.getSystemOrProcess() != null && !payload.getSystemOrProcess().isBlank()) {
            scope.setSystemOrProcess(payload.getSystemOrProcess().trim());
            changes.put("system_or_process", scope.getSystemOrProcess());
        }
        if (payload.getRegulatoryClause() != null) {
            scope.setRegulatoryClause(payload.getRegulatoryClause().trim());
            changes.put("regulatory_clause", scope.getRegulatoryClause());
        }
        if (payload.getInScope() != null) {
            scope.setInScope(payload.getInScope());
            changes.put("in_scope", scope.getInScope());
        }

        scope = auditScopeRepository.save(scope);

        auditHistoryService.recordAuditHistory(
                companyId,
                currentUser,
                "Mutation",
                "Audit Management",
                "Audit",
                audit.getId(),
                audit.getCode(),
                "Updated audit scope '" + scope.getScopeName() + "'",
                changes,
                ipAddress
        );

        return new AuditScopeOut(scope.getId(), scope.getAuditId(), scope.getScopeName(), scope.getSystemOrProcess(), scope.getRegulatoryClause(), scope.getInScope());
    }

    @Transactional
    public MessageResponse deleteScope(UUID companyId, UUID auditId, UUID scopeId, UUID currentUserId, String ipAddress) {
        AuditEntity audit = auditRepository.findByIdAndCompanyId(auditId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit not found."));

        if ("Closed".equals(audit.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Closed audits are locked; scopes cannot be deleted.");
        }

        AuditScopeEntity scope = auditScopeRepository.findByIdAndAuditIdAndCompanyId(scopeId, auditId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit scope not found."));

        String scopeName = scope.getScopeName();
        auditScopeRepository.delete(scope);

        UserEntity currentUser = userRepository.findById(currentUserId).orElse(null);
        auditHistoryService.recordAuditHistory(
                companyId,
                currentUser,
                "Mutation",
                "Audit Management",
                "Audit",
                audit.getId(),
                audit.getCode(),
                "Removed audit scope '" + scopeName + "'",
                Collections.emptyMap(),
                ipAddress
        );

        return new MessageResponse("Scope '" + scopeName + "' removed from audit " + audit.getCode() + ".");
    }

    @Transactional(readOnly = true)
    public List<AuditResponseOut> listAuditResponses(UUID companyId, UUID auditId) {
        AuditEntity audit = auditRepository.findByIdAndCompanyId(auditId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit not found."));

        List<AuditResponseEntity> responses = auditResponseRepository.findByAuditIdAndCompanyId(audit.getId(), companyId);
        return responses.stream().map(this::mapResponseOut).collect(Collectors.toList());
    }

    @Transactional
    public SubmitAuditResponsesResult submitAuditResponses(
            UUID companyId,
            UUID auditId,
            UUID currentUserId,
            SubmitAuditResponsesRequest payload,
            String ipAddress
    ) {
        AuditEntity audit = auditRepository.findByIdAndCompanyId(auditId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit not found."));

        if ("Closed".equals(audit.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Closed audits are finalized and cannot accept new control responses.");
        }

        UserEntity currentUser = userRepository.findById(currentUserId).orElse(null);
        OffsetDateTime now = OffsetDateTime.now();

        for (AuditResponseItemInput itemIn : payload.getResponses()) {
            ChecklistItemEntity chkItem = checklistItemRepository.findById(itemIn.getChecklistItemId())
                    .filter(item -> item.getCompanyId().equals(companyId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Checklist item '" + itemIn.getChecklistItemId() + "' not found."));

            BigDecimal factor;
            String normalizedValue;
            try {
                factor = auditScoringService.responseValueToFactor(itemIn.getResponseValue());
                normalizedValue = auditScoringService.normalizeResponseValue(itemIn.getResponseValue());
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
            }

            Optional<AuditResponseEntity> existing = auditResponseRepository.findByAuditIdAndChecklistItemId(audit.getId(), chkItem.getId());
            AuditResponseEntity response;
            if (existing.isPresent()) {
                response = existing.get();
                response.setResponseValue(normalizedValue);
                response.setScoreFactor(factor);
                response.setAuditorNotes(itemIn.getAuditorNotes());
                response.setResponderUserId(currentUserId);
                response.setTestedAt(now);
            } else {
                response = new AuditResponseEntity();
                response.setCompanyId(companyId);
                response.setAuditId(audit.getId());
                response.setChecklistItemId(chkItem.getId());
                response.setResponderUserId(currentUserId);
                response.setResponseValue(normalizedValue);
                response.setScoreFactor(factor);
                response.setAuditorNotes(itemIn.getAuditorNotes());
                response.setTestedAt(now);
            }
            auditResponseRepository.save(response);
        }

        // Advance lifecycle if Draft or Scheduled
        if ("Draft".equals(audit.getStatus()) || "Scheduled".equals(audit.getStatus())) {
            audit.setStatus("In Progress");
        }

        auditResponseRepository.flush();

        List<AuditResponseEntity> allResponses = auditResponseRepository.findByAuditIdAndCompanyId(audit.getId(), companyId);
        AuditScoringService.ScoreResult scoreResult = auditScoringService.calculateScore(allResponses);

        if (scoreResult.getScore() != null) {
            audit.setComputedScore(BigDecimal.valueOf(scoreResult.getScore()));
        } else {
            audit.setComputedScore(null);
        }
        auditRepository.saveAndFlush(audit);

        long domainControlsCount = checklistItemRepository.count(); // fallback or query domain items

        Map<String, Object> changes = Map.of(
                "saved_count", payload.getResponses().size(),
                "computed_score", scoreResult.getScore() != null ? scoreResult.getScore() : "null"
        );

        auditHistoryService.recordAuditHistory(
                companyId,
                currentUser,
                "Control Test",
                "Audit Checklists",
                "Audit",
                audit.getId(),
                audit.getCode(),
                "Submitted " + payload.getResponses().size() + " checklist test response(s); score recalculated to " + audit.getComputedScore() + "%",
                changes,
                ipAddress
        );

        List<AuditResponseOut> responseOutList = allResponses.stream().map(this::mapResponseOut).collect(Collectors.toList());
        int evaluatedCnt = scoreResult.getEvaluatedCount();
        int totalDomain = (int) Math.max(domainControlsCount, evaluatedCnt);

        return new SubmitAuditResponsesResult(
                audit.getId(),
                audit.getCode(),
                scoreResult.getScore(),
                evaluatedCnt,
                Math.max(totalDomain, evaluatedCnt),
                payload.getResponses().size(),
                responseOutList
        );
    }

    private String generateNextCode(UUID companyId, String prefix, int startNum, int pad) {
        List<AuditEntity> existingAudits = auditRepository.findByCompanyId(companyId);
        Set<String> existingCodes = existingAudits.stream().map(AuditEntity::getCode).collect(Collectors.toSet());

        Pattern pattern = Pattern.compile("^" + Pattern.quote(prefix) + "(\\d+)$");
        int maxNum = startNum - 1;

        for (String code : existingCodes) {
            if (code != null) {
                Matcher matcher = pattern.matcher(code);
                if (matcher.matches()) {
                    try {
                        int num = Integer.parseInt(matcher.group(1));
                        maxNum = Math.max(maxNum, num);
                    } catch (NumberFormatException ignored) {}
                }
            }
        }

        int nextNum = maxNum + 1;
        while (true) {
            String candidate = prefix + (pad > 0 ? String.format("%0" + pad + "d", nextNum) : String.valueOf(nextNum));
            if (!existingCodes.contains(candidate)) {
                return candidate;
            }
            nextNum++;
        }
    }

    private List<AuditOut> serializeAudits(UUID companyId, List<AuditEntity> audits) {
        if (audits.isEmpty()) return Collections.emptyList();

        Set<UUID> deptIds = audits.stream().map(AuditEntity::getDepartmentId).collect(Collectors.toSet());
        Set<UUID> userIds = audits.stream().map(AuditEntity::getLeadAuditorId).filter(Objects::nonNull).collect(Collectors.toSet());

        Map<UUID, DepartmentEntity> deptMap = departmentRepository.findAllById(deptIds).stream()
                .collect(Collectors.toMap(DepartmentEntity::getId, d -> d));
        Map<UUID, UserEntity> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(UserEntity::getId, u -> u));

        return audits.stream().map(audit -> {
            DepartmentEntity dept = deptMap.get(audit.getDepartmentId());
            UserEntity lead = audit.getLeadAuditorId() != null ? userMap.get(audit.getLeadAuditorId()) : null;

            int evaluated = (int) auditResponseRepository.countByCompanyIdAndAuditId(companyId, audit.getId());
            int total = evaluated; // minimum evaluated

            AuditOut out = new AuditOut();
            out.setId(audit.getId());
            out.setCompanyId(audit.getCompanyId());
            out.setDepartmentId(audit.getDepartmentId());
            out.setDepartmentName(dept != null ? dept.getName() : "Unknown Department");
            out.setDepartmentCode(dept != null ? dept.getCode() : "N/A");
            out.setLeadAuditorId(audit.getLeadAuditorId());
            out.setLeadAuditorName(lead != null ? lead.getFullName() : "Unassigned");
            out.setLeadAuditorInitials(lead != null ? computeInitials(lead.getFullName()) : "UA");
            out.setLeadAuditorRole(lead != null ? (lead.getJobTitle() != null ? lead.getJobTitle() : lead.getRole()) : "Auditor");
            out.setCode(audit.getCode());
            out.setTitle(audit.getTitle());
            out.setDomain(audit.getDomain());
            out.setFramework(audit.getFramework());
            out.setStatus(audit.getStatus());
            out.setComputedScore(audit.getComputedScore() != null ? audit.getComputedScore().doubleValue() : null);
            out.setControlsEvaluated(evaluated);
            out.setControlsTotal(Math.max(total, evaluated));
            out.setScheduledStart(audit.getScheduledStart());
            out.setTargetDueDate(audit.getTargetDueDate());
            out.setCompletedAt(audit.getCompletedAt());
            out.setSummary(audit.getSummary());

            if (audit.getScopes() != null) {
                out.setScopes(audit.getScopes().stream()
                        .map(s -> new AuditScopeOut(s.getId(), s.getAuditId(), s.getScopeName(), s.getSystemOrProcess(), s.getRegulatoryClause(), s.getInScope()))
                        .collect(Collectors.toList()));
            }

            out.setStages(auditScoringService.computeAuditStages(audit.getStatus(), evaluated, Math.max(total, evaluated)));
            out.setAllowedNextStatuses(AuditScoringService.ALLOWED_AUDIT_TRANSITIONS.getOrDefault(audit.getStatus(), Collections.emptyList()));
            out.setCreatedAt(audit.getCreatedAt());
            out.setUpdatedAt(audit.getUpdatedAt());

            return out;
        }).collect(Collectors.toList());
    }

    private AuditOut serializeAudit(UUID companyId, AuditEntity audit) {
        return serializeAudits(companyId, List.of(audit)).get(0);
    }

    private AuditResponseOut mapResponseOut(AuditResponseEntity resp) {
        AuditResponseOut out = new AuditResponseOut();
        out.setId(resp.getId());
        out.setAuditId(resp.getAuditId());
        out.setChecklistItemId(resp.getChecklistItemId());
        if (resp.getChecklistItem() != null) {
            out.setControlCode(resp.getChecklistItem().getControlCode());
            out.setItemTitle(resp.getChecklistItem().getTitle());
            out.setWeight(resp.getChecklistItem().getWeight() != null ? resp.getChecklistItem().getWeight().doubleValue() : 1.0);
        } else {
            out.setControlCode("UNKNOWN");
            out.setItemTitle("Unknown Control");
            out.setWeight(1.0);
        }
        out.setResponderUserId(resp.getResponderUserId());
        out.setResponderName(resp.getResponder() != null ? resp.getResponder().getFullName() : null);
        out.setResponseValue(resp.getResponseValue());
        out.setScoreFactor(resp.getScoreFactor() != null ? resp.getScoreFactor().doubleValue() : null);
        out.setAuditorNotes(resp.getAuditorNotes());
        out.setTestedAt(resp.getTestedAt());
        return out;
    }

    private String computeInitials(String fullName) {
        if (fullName == null || fullName.isBlank()) return "UA";
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length == 1) {
            return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase();
        }
        return (parts[0].substring(0, 1) + parts[parts.length - 1].substring(0, 1)).toUpperCase();
    }
}
