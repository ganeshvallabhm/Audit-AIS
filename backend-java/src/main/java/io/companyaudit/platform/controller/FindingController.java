package io.companyaudit.platform.controller;

import io.companyaudit.platform.dto.request.FindingCreate;
import io.companyaudit.platform.dto.request.FindingUpdate;
import io.companyaudit.platform.dto.request.RecommendationCreate;
import io.companyaudit.platform.dto.request.RecommendationRespondRequest;
import io.companyaudit.platform.dto.response.FindingOut;
import io.companyaudit.platform.dto.response.MessageResponse;
import io.companyaudit.platform.dto.response.PaginatedResponse;
import io.companyaudit.platform.dto.response.RecommendationOut;
import io.companyaudit.platform.security.UserPrincipal;
import io.companyaudit.platform.service.FindingService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api")
public class FindingController {

    private final FindingService findingService;

    public FindingController(FindingService findingService) {
        this.findingService = findingService;
    }

    @GetMapping("/findings")
    public ResponseEntity<PaginatedResponse<FindingOut>> listFindings(
            @RequestParam(required = false) String severity,
            @RequestParam(required = false, name = "status") String statusFilter,
            @RequestParam(required = false, name = "department_id") UUID departmentId,
            @RequestParam(required = false, name = "audit_id") UUID auditId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        PaginatedResponse<FindingOut> response = findingService.listFindings(
                userPrincipal.getCompanyId(),
                severity,
                statusFilter,
                departmentId,
                auditId,
                search,
                limit,
                offset
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping("/findings")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<FindingOut> createFinding(
            @Valid @RequestBody FindingCreate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        FindingOut created = findingService.createFinding(
                userPrincipal.getCompanyId(),
                userPrincipal.getId(),
                userPrincipal.getRole(),
                payload,
                request.getRemoteAddr()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/findings/{id}")
    public ResponseEntity<FindingOut> getFinding(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        FindingOut finding = findingService.getFinding(userPrincipal.getCompanyId(), id);
        return ResponseEntity.ok(finding);
    }

    @PutMapping("/findings/{id}")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor', 'Department_Head', 'Management')")
    public ResponseEntity<FindingOut> updateFinding(
            @PathVariable UUID id,
            @Valid @RequestBody FindingUpdate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        FindingOut updated = findingService.updateFinding(
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

    @DeleteMapping("/findings/{id}")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<MessageResponse> deleteFinding(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        MessageResponse response = findingService.deleteFinding(
                userPrincipal.getCompanyId(),
                id,
                userPrincipal.getId(),
                userPrincipal.getRole(),
                request.getRemoteAddr()
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping("/recommendations")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<RecommendationOut> createRecommendation(
            @Valid @RequestBody RecommendationCreate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        RecommendationOut created = findingService.createRecommendation(
                userPrincipal.getCompanyId(),
                userPrincipal.getId(),
                userPrincipal.getRole(),
                payload,
                request.getRemoteAddr()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PostMapping("/recommendations/{id}/respond")
    @PreAuthorize("hasAnyRole('Admin', 'Department_Head', 'Management')")
    public ResponseEntity<RecommendationOut> respondRecommendation(
            @PathVariable UUID id,
            @Valid @RequestBody RecommendationRespondRequest payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        RecommendationOut updated = findingService.respondRecommendation(
                userPrincipal.getCompanyId(),
                userPrincipal.getId(),
                userPrincipal.getRole(),
                userPrincipal.getDepartmentId(),
                id,
                payload,
                request.getRemoteAddr()
        );
        return ResponseEntity.ok(updated);
    }
}
