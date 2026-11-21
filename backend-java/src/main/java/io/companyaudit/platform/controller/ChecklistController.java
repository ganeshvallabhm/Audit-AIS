package io.companyaudit.platform.controller;

import io.companyaudit.platform.dto.request.ChecklistCreate;
import io.companyaudit.platform.dto.request.ChecklistItemCreate;
import io.companyaudit.platform.dto.request.ChecklistItemUpdate;
import io.companyaudit.platform.dto.response.ChecklistItemOut;
import io.companyaudit.platform.dto.response.ChecklistOut;
import io.companyaudit.platform.security.UserPrincipal;
import io.companyaudit.platform.service.ChecklistService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping({"/api/checklists", "/api/audit-templates"})
public class ChecklistController {

    private final ChecklistService checklistService;

    public ChecklistController(ChecklistService checklistService) {
        this.checklistService = checklistService;
    }

    @GetMapping
    public ResponseEntity<List<ChecklistOut>> listChecklists(
            @RequestParam(value = "domain", required = false) String domain,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<ChecklistOut> list = checklistService.listChecklists(principal.getCompanyId(), domain);
        return ResponseEntity.ok(list);
    }

    @GetMapping("/{checklist_id}")
    public ResponseEntity<ChecklistOut> getChecklist(
            @PathVariable("checklist_id") UUID checklistId,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistOut out = checklistService.getChecklist(principal.getCompanyId(), checklistId);
        return ResponseEntity.ok(out);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<ChecklistOut> createChecklist(
            @Valid @RequestBody ChecklistCreate request,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistOut created = checklistService.createChecklist(principal.getCompanyId(), request, principal);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PostMapping("/{checklist_id}/items")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<ChecklistItemOut> createChecklistItem(
            @PathVariable("checklist_id") UUID checklistId,
            @Valid @RequestBody ChecklistItemCreate request,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistItemOut created = checklistService.createChecklistItem(principal.getCompanyId(), checklistId, request, principal);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/items/{item_id}")
    @PreAuthorize("hasAnyRole('Admin', 'Auditor')")
    public ResponseEntity<ChecklistItemOut> updateChecklistItem(
            @PathVariable("item_id") UUID itemId,
            @Valid @RequestBody ChecklistItemUpdate request,
            @AuthenticationPrincipal UserPrincipal principal) {
        ChecklistItemOut updated = checklistService.updateChecklistItem(principal.getCompanyId(), itemId, request, principal);
        return ResponseEntity.ok(updated);
    }
}
