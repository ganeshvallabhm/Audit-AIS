package io.companyaudit.platform.controller;

import io.companyaudit.platform.dto.request.CorrectiveActionCreate;
import io.companyaudit.platform.dto.request.CorrectiveActionUpdate;
import io.companyaudit.platform.dto.response.CorrectiveActionOut;
import io.companyaudit.platform.dto.response.MessageResponse;
import io.companyaudit.platform.dto.response.PaginatedResponse;
import io.companyaudit.platform.security.UserPrincipal;
import io.companyaudit.platform.service.CorrectiveActionService;
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
public class CorrectiveActionController {

    private final CorrectiveActionService correctiveActionService;

    public CorrectiveActionController(CorrectiveActionService correctiveActionService) {
        this.correctiveActionService = correctiveActionService;
    }

    @GetMapping("/actions")
    public ResponseEntity<PaginatedResponse<CorrectiveActionOut>> listActions(
            @RequestParam(required = false, name = "finding_id") UUID findingId,
            @RequestParam(required = false, name = "risk_id") UUID riskId,
            @RequestParam(required = false, name = "status") String statusFilter,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        PaginatedResponse<CorrectiveActionOut> response = correctiveActionService.listActions(
                userPrincipal.getCompanyId(),
                findingId,
                riskId,
                statusFilter,
                limit,
                offset
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping("/actions")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor', 'Department_Head')")
    public ResponseEntity<CorrectiveActionOut> createAction(
            @Valid @RequestBody CorrectiveActionCreate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        CorrectiveActionOut created = correctiveActionService.createAction(
                userPrincipal.getCompanyId(),
                userPrincipal.getId(),
                userPrincipal.getRole(),
                userPrincipal.getDepartmentId(),
                payload,
                request.getRemoteAddr()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/actions/{id}")
    public ResponseEntity<CorrectiveActionOut> getAction(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        CorrectiveActionOut action = correctiveActionService.getAction(userPrincipal.getCompanyId(), id);
        return ResponseEntity.ok(action);
    }

    @PutMapping("/actions/{id}")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor', 'Department_Head')")
    public ResponseEntity<CorrectiveActionOut> updateAction(
            @PathVariable UUID id,
            @Valid @RequestBody CorrectiveActionUpdate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        CorrectiveActionOut updated = correctiveActionService.updateAction(
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

    @DeleteMapping("/actions/{id}")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<MessageResponse> deleteAction(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        MessageResponse response = correctiveActionService.deleteAction(
                userPrincipal.getCompanyId(),
                id,
                userPrincipal.getId(),
                userPrincipal.getRole(),
                request.getRemoteAddr()
        );
        return ResponseEntity.ok(response);
    }
}
