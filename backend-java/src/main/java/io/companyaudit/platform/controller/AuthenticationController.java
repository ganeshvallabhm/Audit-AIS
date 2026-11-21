package io.companyaudit.platform.controller;

import io.companyaudit.platform.dto.request.LoginRequest;
import io.companyaudit.platform.dto.response.MessageResponse;
import io.companyaudit.platform.dto.response.TokenResponse;
import io.companyaudit.platform.dto.response.UserSummary;
import io.companyaudit.platform.security.UserPrincipal;
import io.companyaudit.platform.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthenticationController {

    private final AuthService authService;

    public AuthenticationController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<TokenResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        TokenResponse response = authService.login(request, httpRequest, httpResponse);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        TokenResponse response = authService.refresh(httpRequest, httpResponse);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<MessageResponse> logout(
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletResponse httpResponse) {
        MessageResponse response = authService.logout(principal, httpResponse);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/me")
    public ResponseEntity<UserSummary> getMe(@AuthenticationPrincipal UserPrincipal principal) {
        UserSummary response = authService.getMe(principal);
        return ResponseEntity.ok(response);
    }
}
