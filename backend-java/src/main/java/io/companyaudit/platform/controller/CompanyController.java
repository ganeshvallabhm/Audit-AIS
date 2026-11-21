package io.companyaudit.platform.controller;

import io.companyaudit.platform.dto.request.CompanyCreateRequest;
import io.companyaudit.platform.dto.request.CompanyProfileUpdate;
import io.companyaudit.platform.dto.response.CompanyProfileOut;
import io.companyaudit.platform.security.UserPrincipal;
import io.companyaudit.platform.service.CompanyService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class CompanyController {

    private final CompanyService companyService;

    public CompanyController(CompanyService companyService) {
        this.companyService = companyService;
    }

    @GetMapping("/company")
    public ResponseEntity<CompanyProfileOut> getCompanyProfile(@AuthenticationPrincipal UserPrincipal principal) {
        CompanyProfileOut profile = companyService.getCompanyProfile(principal.getCompanyId());
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/company")
    @PreAuthorize("hasAnyRole('Admin', 'Management')")
    public ResponseEntity<CompanyProfileOut> updateCompanyProfile(
            @Valid @RequestBody CompanyProfileUpdate update,
            @AuthenticationPrincipal UserPrincipal principal) {
        CompanyProfileOut profile = companyService.updateCompanyProfile(principal.getCompanyId(), update, principal);
        return ResponseEntity.ok(profile);
    }

    @PostMapping("/companies")
    @PreAuthorize("hasRole('Admin')")
    public ResponseEntity<CompanyProfileOut> createCompany(
            @Valid @RequestBody CompanyCreateRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        CompanyProfileOut created = companyService.createCompany(request, principal);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
