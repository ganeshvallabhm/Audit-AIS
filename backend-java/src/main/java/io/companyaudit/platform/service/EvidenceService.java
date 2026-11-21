package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.*;
import io.companyaudit.platform.dto.request.EvidenceUpdate;
import io.companyaudit.platform.dto.request.EvidenceVerifyRequest;
import io.companyaudit.platform.dto.response.AuditHistoryOut;
import io.companyaudit.platform.dto.response.EvidenceOut;
import io.companyaudit.platform.dto.response.PaginatedResponse;
import io.companyaudit.platform.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class EvidenceService {

    private final EvidenceRepository evidenceRepository;
    private final EvidenceStorageService evidenceStorageService;
    private final CompanyRepository companyRepository;
    private final AuditRepository auditRepository;
    private final FindingRepository findingRepository;
    private final CorrectiveActionRepository correctiveActionRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final AuditHistoryRepository auditHistoryRepository;
    private final AuditHistoryService auditHistoryService;

    public EvidenceService(EvidenceRepository evidenceRepository,
                           EvidenceStorageService evidenceStorageService,
                           CompanyRepository companyRepository,
                           AuditRepository auditRepository,
                           FindingRepository findingRepository,
                           CorrectiveActionRepository correctiveActionRepository,
                           ChecklistItemRepository checklistItemRepository,
                           DepartmentRepository departmentRepository,
                           UserRepository userRepository,
                           AuditHistoryRepository auditHistoryRepository,
                           AuditHistoryService auditHistoryService) {
        this.evidenceRepository = evidenceRepository;
        this.evidenceStorageService = evidenceStorageService;
        this.companyRepository = companyRepository;
        this.auditRepository = auditRepository;
        this.findingRepository = findingRepository;
        this.correctiveActionRepository = correctiveActionRepository;
        this.checklistItemRepository = checklistItemRepository;
        this.departmentRepository = departmentRepository;
        this.userRepository = userRepository;
        this.auditHistoryRepository = auditHistoryRepository;
        this.auditHistoryService = auditHistoryService;
    }

    @Transactional(readOnly = true)
    public PaginatedResponse<EvidenceOut> listEvidence(UUID companyId,
                                                       UUID auditId,
                                                       UUID findingId,
                                                       String status,
                                                       String search,
                                                       int limit,
                                                       int offset) {
        List<EvidenceEntity> all = evidenceRepository.findByCompanyIdOrderByCreatedAtDesc(companyId);

        List<EvidenceEntity> filtered = all.stream().filter(ev -> {
            if (auditId != null && !auditId.equals(ev.getAuditId())) {
                return false;
            }
            if (findingId != null && !findingId.equals(ev.getFindingId())) {
                return false;
            }
            if (status != null && !status.isBlank() && !status.equalsIgnoreCase(ev.getVerificationStatus())) {
                return false;
            }
            if (search != null && !search.trim().isEmpty()) {
                String term = search.trim().toLowerCase(Locale.ROOT);
                boolean matchCode = ev.getCode() != null && ev.getCode().toLowerCase(Locale.ROOT).contains(term);
                boolean matchName = ev.getOriginalFilename() != null && ev.getOriginalFilename().toLowerCase(Locale.ROOT).contains(term);
                boolean matchTag = ev.getTag() != null && ev.getTag().toLowerCase(Locale.ROOT).contains(term);
                boolean matchHash = ev.getSha256Hash() != null && ev.getSha256Hash().toLowerCase(Locale.ROOT).contains(term);
                if (!matchCode && !matchName && !matchTag && !matchHash) {
                    return false;
                }
            }
            return true;
        }).collect(Collectors.toList());

        int total = filtered.size();
        int fromIndex = Math.min(offset, total);
        int toIndex = Math.min(fromIndex + limit, total);
        List<EvidenceEntity> paged = filtered.subList(fromIndex, toIndex);

        List<EvidenceOut> items = serializeEvidenceList(companyId, paged);
        return new PaginatedResponse<>(items, (long) total, offset / Math.max(1, limit) + 1, limit);
    }

    @Transactional
    public EvidenceOut uploadEvidence(UUID companyId,
                                      UUID currentUserId,
                                      String userRole,
                                      UUID currentUserDeptId,
                                      MultipartFile file,
                                      UUID auditId,
                                      UUID findingId,
                                      UUID correctiveActionId,
                                      UUID checklistItemId,
                                      String tag,
                                      String ipAddress) {
        UUID targetDeptId = null;

        if (auditId != null) {
            AuditEntity audit = auditRepository.findByIdAndCompanyId(auditId, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit not found."));
            targetDeptId = audit.getDepartmentId();
        }

        if (findingId != null) {
            FindingEntity finding = findingRepository.findByIdAndCompanyId(findingId, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Finding not found."));
            if (targetDeptId == null) {
                targetDeptId = finding.getDepartmentId();
            }
        }

        if (correctiveActionId != null) {
            correctiveActionRepository.findByIdAndCompanyId(correctiveActionId, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Corrective action not found."));
        }

        if (checklistItemId != null) {
            checklistItemRepository.findById(checklistItemId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Checklist item not found."));
        }

        if ("Department Head".equalsIgnoreCase(userRole) && currentUserDeptId != null && targetDeptId != null) {
            if (!currentUserDeptId.equals(targetDeptId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Department Heads can only upload evidence for their department.");
            }
        }

        EvidenceStorageService.StorageResult storageResult = evidenceStorageService.storeUploadedEvidence(file, companyId);
        String code = generateNextEvidenceCode(companyId);

        EvidenceEntity ev = new EvidenceEntity();
        ev.setCompanyId(companyId);
        ev.setAuditId(auditId);
        ev.setFindingId(findingId);
        ev.setCorrectiveActionId(correctiveActionId);
        ev.setChecklistItemId(checklistItemId);
        ev.setUploadedByUserId(currentUserId);
        ev.setCode(code);
        ev.setOriginalFilename(storageResult.getOriginalFilename());
        ev.setStorageKey(storageResult.getStorageKey());
        ev.setMimeType(storageResult.getMimeType());
        ev.setByteSize(storageResult.getByteSize());
        ev.setSha256Hash(storageResult.getSha256Hash());
        ev.setVerificationStatus("Pending Review");
        ev.setTag(tag);

        EvidenceEntity saved = evidenceRepository.saveAndFlush(ev);

        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("sha256_hash", saved.getSha256Hash());
        changes.put("mime_type", saved.getMimeType());

        auditHistoryService.recordEvent(
                companyId,
                "Evidence",
                "Evidence Management",
                "Evidence",
                saved.getId(),
                saved.getCode(),
                "Uploaded SHA-256 verified artifact '" + saved.getOriginalFilename() + "' (" + saved.getByteSize() + " bytes)",
                currentUserId,
                userRole,
                ipAddress,
                changes
        );

        return serializeEvidence(companyId, saved);
    }

    @Transactional(readOnly = true)
    public FileDownloadResult downloadEvidence(UUID companyId, UUID evidenceId) {
        EvidenceEntity ev = evidenceRepository.findByIdAndCompanyId(evidenceId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Evidence artifact not found."));

        Path path = evidenceStorageService.resolveEvidencePath(ev.getStorageKey());
        if (!Files.isRegularFile(path)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Evidence file missing from storage vault.");
        }

        boolean valid = evidenceStorageService.verifyStoredFileSha256(ev.getStorageKey(), ev.getSha256Hash());
        if (!valid) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Evidence checksum mismatch detected! File integrity check failed.");
        }

        return new FileDownloadResult(path, ev.getMimeType(), ev.getOriginalFilename(), ev.getSha256Hash());
    }

    @Transactional
    public EvidenceOut verifyEvidence(UUID companyId, UUID evidenceId, UUID currentUserId, String userRole, EvidenceVerifyRequest request, String ipAddress) {
        EvidenceEntity ev = evidenceRepository.findByIdAndCompanyId(evidenceId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Evidence artifact not found."));

        if (Boolean.TRUE.equals(request.getVerifyFileChecksum())) {
            boolean valid = evidenceStorageService.verifyStoredFileSha256(ev.getStorageKey(), ev.getSha256Hash());
            if (!valid) {
                ev.setVerificationStatus("Flagged");
                evidenceRepository.saveAndFlush(ev);
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Stored file failed SHA-256 verification and has been marked Flagged.");
            }
        }

        ev.setVerificationStatus(request.getVerificationStatus());
        ev.setReviewedByUserId(currentUserId);
        ev.setReviewedAt(OffsetDateTime.now());

        EvidenceEntity saved = evidenceRepository.saveAndFlush(ev);

        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("verification_status", saved.getVerificationStatus());

        auditHistoryService.recordEvent(
                companyId,
                "Evidence",
                "Evidence Management",
                "Evidence",
                saved.getId(),
                saved.getCode(),
                "Marked evidence '" + saved.getCode() + "' as '" + saved.getVerificationStatus() + "'",
                currentUserId,
                userRole,
                ipAddress,
                changes
        );

        return serializeEvidence(companyId, saved);
    }

    @Transactional
    public EvidenceOut updateEvidenceMetadata(UUID companyId,
                                             UUID evidenceId,
                                             UUID currentUserId,
                                             String userRole,
                                             UUID currentUserDeptId,
                                             EvidenceUpdate request,
                                             String ipAddress) {
        EvidenceEntity ev = evidenceRepository.findByIdAndCompanyId(evidenceId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Evidence artifact not found."));

        CompanyEntity company = companyRepository.findById(companyId).orElse(null);
        boolean hasLinkMutations = request.getAuditId() != null || request.getFindingId() != null ||
                request.getCorrectiveActionId() != null || request.getChecklistItemId() != null;

        if (company != null && Boolean.TRUE.equals(company.getShaLockEnabled()) && "Verified".equalsIgnoreCase(ev.getVerificationStatus()) && hasLinkMutations) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Verified evidence links are protected while Enterprise SHA-256 Lock is active.");
        }

        UUID targetDeptId = null;
        if (request.getAuditId() != null) {
            AuditEntity a = auditRepository.findByIdAndCompanyId(request.getAuditId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Audit not found."));
            targetDeptId = a.getDepartmentId();
        } else if (ev.getAuditId() != null) {
            AuditEntity a = auditRepository.findByIdAndCompanyId(ev.getAuditId(), companyId).orElse(null);
            if (a != null) targetDeptId = a.getDepartmentId();
        }

        if (request.getFindingId() != null) {
            FindingEntity f = findingRepository.findByIdAndCompanyId(request.getFindingId(), companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Finding not found."));
            if (targetDeptId == null) targetDeptId = f.getDepartmentId();
        }

        if ("Department Head".equalsIgnoreCase(userRole)) {
            if (!currentUserId.equals(ev.getUploadedByUserId()) && targetDeptId == null) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Department Heads can only modify evidence linked to their department.");
            }
            if (targetDeptId != null && currentUserDeptId != null && !currentUserDeptId.equals(targetDeptId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Department Heads can only modify evidence linked to their department.");
            }
        }

        Map<String, Object> changes = new LinkedHashMap<>();
        if (request.getAuditId() != null) {
            ev.setAuditId(request.getAuditId());
            changes.put("audit_id", request.getAuditId().toString());
        }
        if (request.getFindingId() != null) {
            ev.setFindingId(request.getFindingId());
            changes.put("finding_id", request.getFindingId().toString());
        }
        if (request.getCorrectiveActionId() != null) {
            ev.setCorrectiveActionId(request.getCorrectiveActionId());
            changes.put("corrective_action_id", request.getCorrectiveActionId().toString());
        }
        if (request.getChecklistItemId() != null) {
            ev.setChecklistItemId(request.getChecklistItemId());
            changes.put("checklist_item_id", request.getChecklistItemId().toString());
        }
        if (request.getTag() != null) {
            ev.setTag(request.getTag());
            changes.put("tag", request.getTag());
        }

        EvidenceEntity saved = evidenceRepository.saveAndFlush(ev);

        auditHistoryService.recordEvent(
                companyId,
                "Evidence",
                "Evidence Management",
                "Evidence",
                saved.getId(),
                saved.getCode(),
                "Updated evidence '" + saved.getCode() + "' metadata and linkage",
                currentUserId,
                userRole,
                ipAddress,
                changes
        );

        return serializeEvidence(companyId, saved);
    }

    @Transactional(readOnly = true)
    public List<AuditHistoryOut> getEvidenceHistory(UUID companyId, UUID evidenceId) {
        EvidenceEntity ev = evidenceRepository.findByIdAndCompanyId(evidenceId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Evidence artifact not found."));

        List<AuditHistoryEntity> rows = auditHistoryRepository.findByCompanyIdOrderByCreatedAtAsc(companyId).stream()
                .filter(h -> "Evidence".equalsIgnoreCase(h.getEntityType()) && evidenceId.equals(h.getEntityId()))
                .sorted(Comparator.comparing(AuditHistoryEntity::getCreatedAt).reversed())
                .collect(Collectors.toList());

        List<AuditHistoryOut> output = new ArrayList<>();
        for (AuditHistoryEntity h : rows) {
            AuditHistoryOut ho = new AuditHistoryOut();
            ho.setId(h.getId());
            ho.setCompanyId(h.getCompanyId());
            ho.setCategory(h.getCategory());
            ho.setModule(h.getModule());
            ho.setEntityType(h.getEntityType());
            ho.setEntityId(h.getEntityId());
            ho.setEntityRef(h.getEntityRef());
            ho.setAction(h.getAction());
            ho.setActorId(h.getActorUserId());
            ho.setActorRole(h.getActorRole());
            ho.setIpAddress(h.getIpAddress());
            ho.setChangesJson(h.getChangesJson() != null ? h.getChangesJson().toString() : "{}");
            ho.setPrevEventSha256(h.getPrevEventSha256());
            ho.setEventSha256(h.getEventSha256());
            ho.setCreatedAt(h.getCreatedAt());
            output.add(ho);
        }
        return output;
    }

    public EvidenceOut serializeEvidence(UUID companyId, EvidenceEntity ev) {
        return serializeEvidenceList(companyId, List.of(ev)).get(0);
    }

    public List<EvidenceOut> serializeEvidenceList(UUID companyId, List<EvidenceEntity> rows) {
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyList();
        }

        Set<UUID> auditIds = rows.stream().map(EvidenceEntity::getAuditId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> findingIds = rows.stream().map(EvidenceEntity::getFindingId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> userIds = new HashSet<>();
        for (EvidenceEntity ev : rows) {
            if (ev.getUploadedByUserId() != null) userIds.add(ev.getUploadedByUserId());
            if (ev.getReviewedByUserId() != null) userIds.add(ev.getReviewedByUserId());
        }

        Map<UUID, AuditEntity> auditMap = auditIds.isEmpty() ? Collections.emptyMap() :
                auditRepository.findAllById(auditIds).stream().collect(Collectors.toMap(AuditEntity::getId, a -> a, (a, b) -> a));

        Map<UUID, FindingEntity> findingMap = findingIds.isEmpty() ? Collections.emptyMap() :
                findingRepository.findAllById(findingIds).stream().collect(Collectors.toMap(FindingEntity::getId, f -> f, (a, b) -> a));

        Set<UUID> deptIds = new HashSet<>();
        for (AuditEntity a : auditMap.values()) {
            if (a.getDepartmentId() != null) deptIds.add(a.getDepartmentId());
        }
        for (FindingEntity f : findingMap.values()) {
            if (f.getDepartmentId() != null) deptIds.add(f.getDepartmentId());
        }

        Map<UUID, DepartmentEntity> deptMap = deptIds.isEmpty() ? Collections.emptyMap() :
                departmentRepository.findAllById(deptIds).stream().collect(Collectors.toMap(DepartmentEntity::getId, d -> d, (a, b) -> a));

        Map<UUID, UserEntity> userMap = userIds.isEmpty() ? Collections.emptyMap() :
                userRepository.findAllById(userIds).stream().collect(Collectors.toMap(UserEntity::getId, u -> u, (a, b) -> a));

        List<EvidenceOut> output = new ArrayList<>();
        for (EvidenceEntity ev : rows) {
            AuditEntity audit = ev.getAuditId() != null ? auditMap.get(ev.getAuditId()) : null;
            FindingEntity finding = ev.getFindingId() != null ? findingMap.get(ev.getFindingId()) : null;
            UserEntity uploader = userMap.get(ev.getUploadedByUserId());
            UserEntity reviewer = ev.getReviewedByUserId() != null ? userMap.get(ev.getReviewedByUserId()) : null;

            String deptName = null;
            if (audit != null && audit.getDepartmentId() != null && deptMap.containsKey(audit.getDepartmentId())) {
                deptName = deptMap.get(audit.getDepartmentId()).getName();
            } else if (finding != null && finding.getDepartmentId() != null && deptMap.containsKey(finding.getDepartmentId())) {
                deptName = deptMap.get(finding.getDepartmentId()).getName();
            }

            EvidenceOut eo = new EvidenceOut();
            eo.setId(ev.getId());
            eo.setCompanyId(ev.getCompanyId());
            eo.setAuditId(ev.getAuditId());
            eo.setAuditCode(audit != null ? audit.getCode() : null);
            eo.setDepartmentName(deptName);
            eo.setFindingId(ev.getFindingId());
            eo.setFindingCode(finding != null ? finding.getCode() : null);
            eo.setCorrectiveActionId(ev.getCorrectiveActionId());
            eo.setChecklistItemId(ev.getChecklistItemId());
            eo.setUploadedByUserId(ev.getUploadedByUserId());
            eo.setUploadedByName(uploader != null ? uploader.getFullName() : "System");
            eo.setReviewedByUserId(ev.getReviewedByUserId());
            eo.setReviewedByName(reviewer != null ? reviewer.getFullName() : null);
            eo.setCode(ev.getCode());
            eo.setOriginalFilename(ev.getOriginalFilename());
            eo.setMimeType(ev.getMimeType());
            eo.setByteSize(ev.getByteSize());
            eo.setSha256Hash(ev.getSha256Hash());
            eo.setVerificationStatus(ev.getVerificationStatus());
            eo.setTag(ev.getTag());
            eo.setReviewedAt(ev.getReviewedAt());
            eo.setCreatedAt(ev.getCreatedAt());
            eo.setUpdatedAt(ev.getUpdatedAt());

            output.add(eo);
        }

        return output;
    }

    public String generateNextEvidenceCode(UUID companyId) {
        List<EvidenceEntity> existing = evidenceRepository.findByCompanyIdOrderByCreatedAtDesc(companyId);
        int maxNum = 4100;
        Pattern pattern = Pattern.compile("^EVD-(\\d+)$");
        for (EvidenceEntity e : existing) {
            if (e.getCode() != null) {
                Matcher m = pattern.matcher(e.getCode());
                if (m.matches()) {
                    try {
                        int num = Integer.parseInt(m.group(1));
                        if (num > maxNum) maxNum = num;
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        return "EVD-" + (maxNum + 1);
    }

    public static class FileDownloadResult {
        private final Path path;
        private final String mimeType;
        private final String originalFilename;
        private final String sha256Hash;

        public FileDownloadResult(Path path, String mimeType, String originalFilename, String sha256Hash) {
            this.path = path;
            this.mimeType = mimeType;
            this.originalFilename = originalFilename;
            this.sha256Hash = sha256Hash;
        }

        public Path getPath() {
            return path;
        }

        public String getMimeType() {
            return mimeType;
        }

        public String getOriginalFilename() {
            return originalFilename;
        }

        public String getSha256Hash() {
            return sha256Hash;
        }
    }
}
