package io.companyaudit.platform.controller;

import io.companyaudit.platform.dto.request.DepartmentCreate;
import io.companyaudit.platform.dto.request.DepartmentUpdate;
import io.companyaudit.platform.dto.response.DepartmentOut;
import io.companyaudit.platform.dto.response.MessageResponse;
import io.companyaudit.platform.security.UserPrincipal;
import io.companyaudit.platform.service.DepartmentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/departments")
public class DepartmentController {

    private final DepartmentService departmentService;

    public DepartmentController(DepartmentService departmentService) {
        this.departmentService = departmentService;
    }

    @GetMapping
    public ResponseEntity<List<DepartmentOut>> listDepartments(@AuthenticationPrincipal UserPrincipal principal) {
        List<DepartmentOut> list = departmentService.listDepartments(principal.getCompanyId());
        return ResponseEntity.ok(list);
    }

    @GetMapping("/{department_id}")
    public ResponseEntity<DepartmentOut> getDepartment(
            @PathVariable("department_id") UUID departmentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        DepartmentOut out = departmentService.getDepartment(principal.getCompanyId(), departmentId);
        return ResponseEntity.ok(out);
    }

    @PostMapping
    @PreAuthorize("hasRole('Admin')")
    public ResponseEntity<DepartmentOut> createDepartment(
            @Valid @RequestBody DepartmentCreate request,
            @AuthenticationPrincipal UserPrincipal principal) {
        DepartmentOut created = departmentService.createDepartment(principal.getCompanyId(), request, principal);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{department_id}")
    @PreAuthorize("hasRole('Admin')")
    public ResponseEntity<DepartmentOut> updateDepartment(
            @PathVariable("department_id") UUID departmentId,
            @Valid @RequestBody DepartmentUpdate request,
            @AuthenticationPrincipal UserPrincipal principal) {
        DepartmentOut updated = departmentService.updateDepartment(principal.getCompanyId(), departmentId, request, principal);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{department_id}")
    @PreAuthorize("hasRole('Admin')")
    public ResponseEntity<MessageResponse> deleteDepartment(
            @PathVariable("department_id") UUID departmentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        MessageResponse response = departmentService.deleteDepartment(principal.getCompanyId(), departmentId, principal);
        return ResponseEntity.ok(response);
    }
}
