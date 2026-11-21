package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.DepartmentEntity;
import io.companyaudit.platform.domain.UserEntity;
import io.companyaudit.platform.dto.request.AdminResetPasswordRequest;
import io.companyaudit.platform.dto.request.RegisterUserRequest;
import io.companyaudit.platform.dto.request.UserUpdateRequest;
import io.companyaudit.platform.dto.response.MessageResponse;
import io.companyaudit.platform.dto.response.UserSummary;
import io.companyaudit.platform.repository.DepartmentRepository;
import io.companyaudit.platform.repository.RefreshSessionRepository;
import io.companyaudit.platform.repository.UserRepository;
import io.companyaudit.platform.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final RefreshSessionRepository refreshSessionRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository,
                       DepartmentRepository departmentRepository,
                       RefreshSessionRepository refreshSessionRepository,
                       PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.departmentRepository = departmentRepository;
        this.refreshSessionRepository = refreshSessionRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<UserSummary> listCompanyUsers(UUID companyId) {
        List<UserEntity> users = userRepository.findAllByCompanyId(companyId);
        return serializeUsers(users);
    }

    @Transactional(readOnly = true)
    public UserSummary getUserById(UUID companyId, UUID userId) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found."));

        if (!user.getCompanyId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found in your organization.");
        }

        return serializeUser(user);
    }

    @Transactional
    public UserSummary registerUser(UUID companyId, RegisterUserRequest request, UserPrincipal currentUser) {
        String normalizedEmail = request.getEmail().trim().toLowerCase();

        if (userRepository.findByEmailIgnoreCase(normalizedEmail).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A user with this email already exists in your organization.");
        }

        if (request.getDepartmentId() != null) {
            DepartmentEntity dept = departmentRepository.findById(request.getDepartmentId()).orElse(null);
            if (dept == null || !dept.getCompanyId().equals(companyId)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Referenced department not found in your organization.");
            }
        }

        UserEntity user = new UserEntity();
        user.setCompanyId(companyId);
        user.setDepartmentId(request.getDepartmentId());
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setFullName(request.getFullName().trim());
        user.setJobTitle(request.getJobTitle());
        user.setRole(request.getRole());
        user.setCertifications(request.getCertifications() != null ? new ArrayList<>(request.getCertifications()) : new ArrayList<>());
        user.setTokenVersion(1);
        user.setIsActive(true);

        UserEntity saved = userRepository.save(user);
        return serializeUser(saved);
    }

    @Transactional
    public UserSummary updateUser(UUID companyId, UUID targetUserId, UserUpdateRequest request, UserPrincipal currentUser) {
        UserEntity target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found."));

        if (!target.getCompanyId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found in your organization.");
        }

        if (request.getFullName() != null) target.setFullName(request.getFullName().trim());
        if (request.getJobTitle() != null) target.setJobTitle(request.getJobTitle());
        if (request.getRole() != null) target.setRole(request.getRole());

        if (request.getDepartmentId() != null) {
            DepartmentEntity dept = departmentRepository.findById(request.getDepartmentId()).orElse(null);
            if (dept == null || !dept.getCompanyId().equals(companyId)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found in your organization.");
            }
            target.setDepartmentId(request.getDepartmentId());
        }

        if (request.getIsActive() != null) {
            target.setIsActive(request.getIsActive());
            if (Boolean.FALSE.equals(request.getIsActive())) {
                target.setTokenVersion(target.getTokenVersion() + 1);
                refreshSessionRepository.revokeAllForUser(companyId, target.getId(), OffsetDateTime.now());
            }
        }

        if (request.getCertifications() != null) {
            target.setCertifications(new ArrayList<>(request.getCertifications()));
        }

        UserEntity saved = userRepository.save(target);
        return serializeUser(saved);
    }

    @Transactional
    public MessageResponse resetPassword(UUID companyId, UUID targetUserId, AdminResetPasswordRequest request, UserPrincipal currentUser) {
        UserEntity target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found."));

        if (!target.getCompanyId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found in your organization.");
        }

        target.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        target.setTokenVersion(target.getTokenVersion() + 1);
        userRepository.save(target);

        refreshSessionRepository.revokeAllForUser(companyId, target.getId(), OffsetDateTime.now());
        return new MessageResponse("Password updated and active sessions revoked for " + target.getEmail() + ".");
    }

    public List<UserSummary> serializeUsers(List<UserEntity> users) {
        if (users == null || users.isEmpty()) return Collections.emptyList();

        Set<UUID> deptIds = users.stream()
                .map(UserEntity::getDepartmentId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Map<UUID, String> deptNames = new HashMap<>();
        if (!deptIds.isEmpty()) {
            departmentRepository.findAllById(deptIds)
                    .forEach(d -> deptNames.put(d.getId(), d.getName()));
        }

        return users.stream().map(u -> {
            UserSummary s = new UserSummary();
            s.setId(u.getId());
            s.setCompanyId(u.getCompanyId());
            s.setDepartmentId(u.getDepartmentId());
            s.setDepartmentName(u.getDepartmentId() != null ? deptNames.get(u.getDepartmentId()) : null);
            s.setEmail(u.getEmail());
            s.setFullName(u.getFullName());
            s.setInitials(AuthService.computeInitials(u.getFullName()));
            s.setJobTitle(u.getJobTitle());
            s.setRole(u.getRole());
            s.setCertifications(u.getCertifications() != null ? u.getCertifications() : new ArrayList<>());
            s.setIsActive(u.getIsActive());
            s.setLastLoginAt(u.getLastLoginAt());
            return s;
        }).collect(Collectors.toList());
    }

    public UserSummary serializeUser(UserEntity user) {
        return serializeUsers(Collections.singletonList(user)).get(0);
    }
}
