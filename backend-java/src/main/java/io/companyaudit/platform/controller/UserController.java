package io.companyaudit.platform.controller;

import io.companyaudit.platform.dto.request.AdminResetPasswordRequest;
import io.companyaudit.platform.dto.request.RegisterUserRequest;
import io.companyaudit.platform.dto.request.UserUpdateRequest;
import io.companyaudit.platform.dto.response.MessageResponse;
import io.companyaudit.platform.dto.response.UserSummary;
import io.companyaudit.platform.security.UserPrincipal;
import io.companyaudit.platform.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/users")
    public ResponseEntity<List<UserSummary>> listUsers(@AuthenticationPrincipal UserPrincipal principal) {
        List<UserSummary> users = userService.listCompanyUsers(principal.getCompanyId());
        return ResponseEntity.ok(users);
    }

    @GetMapping("/users/{user_id}")
    public ResponseEntity<UserSummary> getUser(
            @PathVariable("user_id") UUID userId,
            @AuthenticationPrincipal UserPrincipal principal) {
        UserSummary user = userService.getUserById(principal.getCompanyId(), userId);
        return ResponseEntity.ok(user);
    }

    @PostMapping("/register")
    @PreAuthorize("hasRole('Admin')")
    public ResponseEntity<UserSummary> registerUser(
            @Valid @RequestBody RegisterUserRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        UserSummary created = userService.registerUser(principal.getCompanyId(), request, principal);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/users/{user_id}")
    @PreAuthorize("hasRole('Admin')")
    public ResponseEntity<UserSummary> updateUser(
            @PathVariable("user_id") UUID userId,
            @Valid @RequestBody UserUpdateRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        UserSummary updated = userService.updateUser(principal.getCompanyId(), userId, request, principal);
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/users/{user_id}/reset-password")
    @PreAuthorize("hasRole('Admin')")
    public ResponseEntity<MessageResponse> resetPassword(
            @PathVariable("user_id") UUID userId,
            @Valid @RequestBody AdminResetPasswordRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        MessageResponse response = userService.resetPassword(principal.getCompanyId(), userId, request, principal);
        return ResponseEntity.ok(response);
    }
}
