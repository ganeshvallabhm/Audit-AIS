package io.companyaudit.platform.controller;

import io.companyaudit.platform.dto.request.RiskCreate;
import io.companyaudit.platform.dto.request.RiskEscalateRequest;
import io.companyaudit.platform.dto.request.RiskUpdate;
import io.companyaudit.platform.dto.response.PaginatedResponse;
import io.companyaudit.platform.dto.response.RiskOut;
import io.companyaudit.platform.security.UserPrincipal;
import io.companyaudit.platform.service.RiskService;
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
public class RiskController {

    private final RiskService riskService;

    public RiskController(RiskService riskService) {
        this.riskService = riskService;
    }

    @GetMapping("/risks")
    public ResponseEntity<PaginatedResponse<RiskOut>> listRisks(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false, name = "status") String statusFilter,
            @RequestParam(required = false) Integer probability,
            @RequestParam(required = false) Integer impact,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        PaginatedResponse<RiskOut> response = riskService.listRisks(
                userPrincipal.getCompanyId(),
                category,
                severity,
                statusFilter,
                probability,
                impact,
                search,
                limit,
                offset
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping("/risks")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<RiskOut> createRisk(
            @Valid @RequestBody RiskCreate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        RiskOut created = riskService.createRisk(
                userPrincipal.getCompanyId(),
                userPrincipal.getId(),
                userPrincipal.getRole(),
                payload,
                request.getRemoteAddr()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/risks/{id}")
    public ResponseEntity<RiskOut> getRisk(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal userPrincipal
    ) {
        RiskOut risk = riskService.getRisk(userPrincipal.getCompanyId(), id);
        return ResponseEntity.ok(risk);
    }

    @PutMapping("/risks/{id}")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor', 'Management')")
    public ResponseEntity<RiskOut> updateRisk(
            @PathVariable UUID id,
            @Valid @RequestBody RiskUpdate payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        RiskOut updated = riskService.updateRisk(
                userPrincipal.getCompanyId(),
                id,
                userPrincipal.getId(),
                userPrincipal.getRole(),
                payload,
                request.getRemoteAddr()
        );
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/risks/{id}/escalate")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor', 'Management')")
    public ResponseEntity<RiskOut> escalateRisk(
            @PathVariable UUID id,
            @Valid @RequestBody RiskEscalateRequest payload,
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            HttpServletRequest request
    ) {
        RiskOut escalated = riskService.escalateRisk(
                userPrincipal.getCompanyId(),
                id,
                userPrincipal.getId(),
                userPrincipal.getRole(),
                payload,
                request.getRemoteAddr()
        );
        return ResponseEntity.ok(escalated);
    }
}
