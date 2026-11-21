package io.companyaudit.platform.controller;

import io.companyaudit.platform.dto.request.EvidenceUpdate;
import io.companyaudit.platform.dto.request.EvidenceVerifyRequest;
import io.companyaudit.platform.dto.response.AuditHistoryOut;
import io.companyaudit.platform.dto.response.EvidenceOut;
import io.companyaudit.platform.dto.response.PaginatedResponse;
import io.companyaudit.platform.security.UserPrincipal;
import io.companyaudit.platform.service.EvidenceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class EvidenceController {

    private final EvidenceService evidenceService;

    public EvidenceController(EvidenceService evidenceService) {
        this.evidenceService = evidenceService;
    }

    @GetMapping("/evidence")
    public ResponseEntity<PaginatedResponse<EvidenceOut>> listEvidence(
            @RequestParam(required = false, name = "audit_id") UUID auditId,
            @RequestParam(required = false, name = "finding_id") UUID findingId,
            @RequestParam(required = false, name = "status") String statusFilter,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        PaginatedResponse<EvidenceOut> response = evidenceService.listEvidence(
                userPrincipal.getCompanyId(),
                auditId,
                findingId,
                statusFilter,
                search,
                limit,
                offset
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping(value = "/evidence", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('Admin', 'Auditor', 'Department_Head')")
    public ResponseEntity<EvidenceOut> uploadEvidence(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false, name = "audit_id") UUID auditId,
            @RequestParam(required = false, name = "finding_id") UUID findingId,
            @RequestParam(required = false, name = "corrective_action_id") UUID correctiveActionId,
            @RequestParam(required = false, name = "checklist_item_id") UUID checklistItemId,
            @RequestParam(required = false) String tag,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        EvidenceOut uploaded = evidenceService.uploadEvidence(
                userPrincipal.getCompanyId(),
                userPrincipal.getId(),
                userPrincipal.getRole(),
                userPrincipal.getDepartmentId(),
                file,
                auditId,
                findingId,
                correctiveActionId,
                checklistItemId,
                tag,
                request.getRemoteAddr()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(uploaded);
    }

    @GetMapping("/evidence/{id}/download")
    public ResponseEntity<Resource> downloadEvidence(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        EvidenceService.FileDownloadResult result = evidenceService.downloadEvidence(userPrincipal.getCompanyId(), id);
        Resource resource = new FileSystemResource(result.getPath().toFile());

        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Content-Type-Options", "nosniff");
        headers.add("X-Evidence-SHA256", result.getSha256Hash());
        headers.setContentDispositionFormData("attachment", result.getOriginalFilename());

        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(result.getMimeType());
        } catch (Exception e) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }

        return ResponseEntity.ok()
                .headers(headers)
                .contentType(mediaType)
                .body(resource);
    }

    @PutMapping("/evidence/{id}/verify")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<EvidenceOut> verifyEvidence(
            @PathVariable UUID id,
            @Valid @RequestBody EvidenceVerifyRequest payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        EvidenceOut verified = evidenceService.verifyEvidence(
                userPrincipal.getCompanyId(),
                id,
                userPrincipal.getId(),
                userPrincipal.getRole(),
                payload,
                request.getRemoteAddr()
        );
        return ResponseEntity.ok(verified);
    }

    @PutMapping("/evidence/{id}")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor', 'Department_Head')")
    public ResponseEntity<EvidenceOut> updateEvidence(
            @PathVariable UUID id,
            @Valid @RequestBody EvidenceUpdate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        EvidenceOut updated = evidenceService.updateEvidenceMetadata(
                userPrincipal.getCompanyId(),
                id,
                userPrincipal.getId(),
                userPrincipal.getRole(),
                userPrincipal.getDepartmentId(),
                payload,
                request.getRemoteAddr()
        );
        return ResponseEntity.ok(updated);
    }

    @GetMapping("/evidence/{id}/history")
    public ResponseEntity<List<AuditHistoryOut>> getEvidenceHistory(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        List<AuditHistoryOut> history = evidenceService.getEvidenceHistory(userPrincipal.getCompanyId(), id);
        return ResponseEntity.ok(history);
    }
}
