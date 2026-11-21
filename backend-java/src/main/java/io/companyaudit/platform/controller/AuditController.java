package io.companyaudit.platform.controller;

import io.companyaudit.platform.dto.request.*;
import io.companyaudit.platform.dto.response.*;
import io.companyaudit.platform.security.UserPrincipal;
import io.companyaudit.platform.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class AuditController {

    private final AuditService auditService;

    public AuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    @GetMapping("/audits")
    public ResponseEntity<PaginatedResponse<AuditOut>> listAudits(
            @RequestParam(required = false) String domain,
            @RequestParam(required = false, name = "status") String statusFilter,
            @RequestParam(required = false, name = "department_id") UUID departmentId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        PaginatedResponse<AuditOut> response = auditService.listAudits(
                userPrincipal.getCompanyId(),
                domain,
                statusFilter,
                departmentId,
                search,
                limit,
                offset
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping("/audits")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<AuditOut> createAudit(
            @Valid @RequestBody AuditCreate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        AuditOut created = auditService.createAudit(
                userPrincipal.getCompanyId(),
                userPrincipal.getId(),
                payload,
                extractClientIp(request)
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/audits/{audit_id}")
    public ResponseEntity<AuditOut> getAudit(
            @PathVariable("audit_id") UUID auditId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        AuditOut audit = auditService.getAudit(userPrincipal.getCompanyId(), auditId);
        return ResponseEntity.ok(audit);
    }

    @PutMapping("/audits/{audit_id}")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<AuditOut> updateAudit(
            @PathVariable("audit_id") UUID auditId,
            @Valid @RequestBody AuditUpdate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        AuditOut updated = auditService.updateAudit(
                userPrincipal.getCompanyId(),
                auditId,
                userPrincipal.getId(),
                payload,
                extractClientIp(request)
        );
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/audits/{audit_id}/scopes")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<AuditScopeOut> addScope(
            @PathVariable("audit_id") UUID auditId,
            @Valid @RequestBody AuditScopeCreate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        AuditScopeOut created = auditService.addScope(
                userPrincipal.getCompanyId(),
                auditId,
                userPrincipal.getId(),
                payload,
                extractClientIp(request)
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/audits/{audit_id}/scopes/{scope_id}")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<AuditScopeOut> updateScope(
            @PathVariable("audit_id") UUID auditId,
            @PathVariable("scope_id") UUID scopeId,
            @Valid @RequestBody AuditScopeUpdate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        AuditScopeOut updated = auditService.updateScope(
                userPrincipal.getCompanyId(),
                auditId,
                scopeId,
                userPrincipal.getId(),
                payload,
                extractClientIp(request)
        );
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/audits/{audit_id}/scopes/{scope_id}")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<MessageResponse> deleteScope(
            @PathVariable("audit_id") UUID auditId,
            @PathVariable("scope_id") UUID scopeId,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        MessageResponse response = auditService.deleteScope(
                userPrincipal.getCompanyId(),
                auditId,
                scopeId,
                userPrincipal.getId(),
                extractClientIp(request)
        );
        return ResponseEntity.ok(response);
    }

    @GetMapping("/audits/{audit_id}/responses")
    public ResponseEntity<List<AuditResponseOut>> listAuditResponses(
            @PathVariable("audit_id") UUID auditId,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        List<AuditResponseOut> responses = auditService.listAuditResponses(userPrincipal.getCompanyId(), auditId);
        return ResponseEntity.ok(responses);
    }

    @PostMapping("/audits/{audit_id}/responses")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<SubmitAuditResponsesResult> submitAuditResponses(
            @PathVariable("audit_id") UUID auditId,
            @Valid @RequestBody SubmitAuditResponsesRequest payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        SubmitAuditResponsesResult result = auditService.submitAuditResponses(
                userPrincipal.getCompanyId(),
                auditId,
                userPrincipal.getId(),
                payload,
                extractClientIp(request)
        );
        return ResponseEntity.ok(result);
    }

    private String extractClientIp(HttpServletRequest request) {
        if (request == null) return null;
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
