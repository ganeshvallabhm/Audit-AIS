package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.DepartmentEntity;
import io.companyaudit.platform.domain.RefreshSessionEntity;
import io.companyaudit.platform.domain.UserEntity;
import io.companyaudit.platform.dto.request.LoginRequest;
import io.companyaudit.platform.dto.response.MessageResponse;
import io.companyaudit.platform.dto.response.TokenResponse;
import io.companyaudit.platform.dto.response.UserSummary;
import io.companyaudit.platform.repository.DepartmentRepository;
import io.companyaudit.platform.repository.RefreshSessionRepository;
import io.companyaudit.platform.repository.UserRepository;
import io.companyaudit.platform.security.JwtTokenProvider;
import io.companyaudit.platform.security.RateLimitingService;
import io.companyaudit.platform.security.UserPrincipal;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.*;

@Service
public class AuthService {

    public static final String REFRESH_COOKIE_NAME = "companyaudit_refresh";
    public static final String CSRF_COOKIE_NAME = "companyaudit_csrf";

    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final RefreshSessionRepository refreshSessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final RateLimitingService rateLimitingService;
    private final boolean cookieSecure;
    private final long refreshTokenDays;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(
            UserRepository userRepository,
            DepartmentRepository departmentRepository,
            RefreshSessionRepository refreshSessionRepository,
            PasswordEncoder passwordEncoder,
            JwtTokenProvider jwtTokenProvider,
            RateLimitingService rateLimitingService,
            @Value("${app.security.cookie-secure:false}") boolean cookieSecure,
            @Value("${app.security.refresh-token-expire-days:7}") long refreshTokenDays) {
        this.userRepository = userRepository;
        this.departmentRepository = departmentRepository;
        this.refreshSessionRepository = refreshSessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.rateLimitingService = rateLimitingService;
        this.cookieSecure = cookieSecure;
        this.refreshTokenDays = refreshTokenDays;
    }

    @Transactional
    public TokenResponse login(LoginRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String clientIp = extractClientIp(httpRequest);
        String normalizedEmail = request.getEmail().trim().toLowerCase();

        // 1. IP rate limit (40 req/min)
        if (!rateLimitingService.isAllowed("auth_login_ip:" + clientIp, 40, 60)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many login attempts. Please try again later.");
        }

        // 2. Account lockout check
        if (rateLimitingService.isAccountLocked(normalizedEmail)) {
            throw new ResponseStatusException(HttpStatus.LOCKED,
                    "Account is temporarily locked due to multiple failed login attempts. Please try again later.");
        }

        // 3. Authenticate user
        UserEntity user = userRepository.findByEmailIgnoreCase(normalizedEmail).orElse(null);

        if (user == null || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            rateLimitingService.recordFailedLogin(normalizedEmail);
            if (!rateLimitingService.isAllowed("auth_login_fail:" + clientIp + ":" + normalizedEmail, 8, 60)) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many failed attempts. Please try again later.");
            }
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password.");
        }

        if (Boolean.FALSE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is deactivated. Contact your organization Administrator.");
        }

        // Reset fail counters on success
        rateLimitingService.recordSuccessfulLogin(normalizedEmail);
        user.setLastLoginAt(OffsetDateTime.now());
        userRepository.save(user);

        // 4. Issue sessions and tokens
        UUID sessionId = UUID.randomUUID();
        UUID tokenFamily = UUID.randomUUID();

        String accessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getCompanyId(), user.getRole(), user.getTokenVersion());
        String refreshToken = jwtTokenProvider.createRefreshToken(user.getId(), user.getCompanyId(), user.getTokenVersion(), sessionId, tokenFamily);

        RefreshSessionEntity session = new RefreshSessionEntity();
        session.setId(sessionId);
        session.setCompanyId(user.getCompanyId());
        session.setUserId(user.getId());
        session.setTokenFamily(tokenFamily);
        session.setTokenHash(jwtTokenProvider.hashToken(refreshToken));
        session.setExpiresAt(OffsetDateTime.now().plusDays(refreshTokenDays));
        session.setIpAddress(clientIp);
        session.setUserAgent(truncate(httpRequest.getHeader("User-Agent"), 255));
        refreshSessionRepository.save(session);

        // 5. Emit cookies
        String csrfToken = generateCsrfToken();
        setAuthCookies(httpResponse, refreshToken, csrfToken);

        UserSummary summary = serializeUser(user);
        return new TokenResponse(accessToken, (int) jwtTokenProvider.getAccessTokenExpiration().toSeconds(), summary);
    }

    @Transactional
    public TokenResponse refresh(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String clientIp = extractClientIp(httpRequest);
        if (!rateLimitingService.isAllowed("auth_refresh:" + clientIp, 40, 60)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many refresh attempts.");
        }

        String refreshToken = extractCookie(httpRequest, REFRESH_COOKIE_NAME);
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token cookie is missing.");
        }

        Claims claims;
        try {
            claims = jwtTokenProvider.parseAndValidateToken(refreshToken, "refresh");
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired refresh token.");
        }

        UUID userId = UUID.fromString(claims.getSubject());
        UUID companyId = UUID.fromString(claims.get("cid", String.class));
        Integer tokenVer = claims.get("ver", Integer.class);

        OffsetDateTime now = OffsetDateTime.now();
        String tokenDigest = jwtTokenProvider.hashToken(refreshToken);
        RefreshSessionEntity session = refreshSessionRepository.findByTokenHash(tokenDigest).orElse(null);
        UserEntity user = userRepository.findById(userId).orElse(null);

        // Family reuse / replay detection
        if (session != null && session.getRevokedAt() != null) {
            refreshSessionRepository.revokeAllInFamily(session.getTokenFamily(), now);
            if (user != null) {
                user.setTokenVersion(user.getTokenVersion() + 1);
                userRepository.save(user);
            }
            clearAuthCookies(httpResponse);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token reuse detected. Session family revoked.");
        }

        if (session == null || session.getExpiresAt().isBefore(now) || user == null ||
                Boolean.FALSE.equals(user.getIsActive()) || !companyId.equals(user.getCompanyId()) ||
                (tokenVer != null && !tokenVer.equals(user.getTokenVersion()))) {
            clearAuthCookies(httpResponse);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Session revoked or expired.");
        }

        // Rotate session
        UUID newSessionId = UUID.randomUUID();
        String newAccessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getCompanyId(), user.getRole(), user.getTokenVersion());
        String newRefreshToken = jwtTokenProvider.createRefreshToken(user.getId(), user.getCompanyId(), user.getTokenVersion(), newSessionId, session.getTokenFamily());

        RefreshSessionEntity newSession = new RefreshSessionEntity();
        newSession.setId(newSessionId);
        newSession.setCompanyId(user.getCompanyId());
        newSession.setUserId(user.getId());
        newSession.setTokenFamily(session.getTokenFamily());
        newSession.setTokenHash(jwtTokenProvider.hashToken(newRefreshToken));
        newSession.setExpiresAt(now.plusDays(refreshTokenDays));
        newSession.setIpAddress(clientIp);
        newSession.setUserAgent(truncate(httpRequest.getHeader("User-Agent"), 255));
        refreshSessionRepository.save(newSession);

        session.setRevokedAt(now);
        session.setReplacedById(newSessionId);
        refreshSessionRepository.save(session);

        String newCsrf = generateCsrfToken();
        setAuthCookies(httpResponse, newRefreshToken, newCsrf);

        return new TokenResponse(newAccessToken, (int) jwtTokenProvider.getAccessTokenExpiration().toSeconds(), serializeUser(user));
    }

    @Transactional
    public MessageResponse logout(UserPrincipal principal, HttpServletResponse httpResponse) {
        if (principal != null) {
            OffsetDateTime now = OffsetDateTime.now();
            refreshSessionRepository.revokeAllForUser(principal.getCompanyId(), principal.getId(), now);
            UserEntity user = userRepository.findById(principal.getId()).orElse(null);
            if (user != null) {
                user.setTokenVersion(user.getTokenVersion() + 1);
                userRepository.save(user);
            }
        }
        clearAuthCookies(httpResponse);
        return new MessageResponse("Logged out successfully");
    }

    @Transactional(readOnly = true)
    public UserSummary getMe(UserPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        UserEntity user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        return serializeUser(user);
    }

    public UserSummary serializeUser(UserEntity user) {
        UserSummary summary = new UserSummary();
        summary.setId(user.getId());
        summary.setCompanyId(user.getCompanyId());
        summary.setDepartmentId(user.getDepartmentId());
        if (user.getDepartmentId() != null) {
            departmentRepository.findById(user.getDepartmentId())
                    .ifPresent(d -> summary.setDepartmentName(d.getName()));
        }
        summary.setEmail(user.getEmail());
        summary.setFullName(user.getFullName());
        summary.setInitials(computeInitials(user.getFullName()));
        summary.setJobTitle(user.getJobTitle());
        summary.setRole(user.getRole());
        summary.setCertifications(user.getCertifications() != null ? user.getCertifications() : new ArrayList<>());
        summary.setIsActive(user.getIsActive());
        summary.setLastLoginAt(user.getLastLoginAt());
        return summary;
    }

    public static String computeInitials(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return "UA";
        }
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length == 1) {
            return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase();
        }
        return ("" + parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    private void setAuthCookies(HttpServletResponse response, String refreshToken, String csrfToken) {
        int maxAge = (int) (refreshTokenDays * 86400);

        Cookie refreshCookie = new Cookie(REFRESH_COOKIE_NAME, refreshToken);
        refreshCookie.setHttpOnly(true);
        refreshCookie.setSecure(cookieSecure);
        refreshCookie.setPath("/");
        refreshCookie.setMaxAge(maxAge);
        refreshCookie.setAttribute("SameSite", "Lax");
        response.addCookie(refreshCookie);

        Cookie csrfCookie = new Cookie(CSRF_COOKIE_NAME, csrfToken);
        csrfCookie.setHttpOnly(false);
        csrfCookie.setSecure(cookieSecure);
        csrfCookie.setPath("/");
        csrfCookie.setMaxAge(maxAge);
        csrfCookie.setAttribute("SameSite", "Lax");
        response.addCookie(csrfCookie);
    }

    private void clearAuthCookies(HttpServletResponse response) {
        Cookie refreshCookie = new Cookie(REFRESH_COOKIE_NAME, "");
        refreshCookie.setHttpOnly(true);
        refreshCookie.setSecure(cookieSecure);
        refreshCookie.setPath("/");
        refreshCookie.setMaxAge(0);
        response.addCookie(refreshCookie);

        Cookie csrfCookie = new Cookie(CSRF_COOKIE_NAME, "");
        csrfCookie.setHttpOnly(false);
        csrfCookie.setSecure(cookieSecure);
        csrfCookie.setPath("/");
        csrfCookie.setMaxAge(0);
        response.addCookie(csrfCookie);
    }

    private String generateCsrfToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String extractCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        for (Cookie cookie : request.getCookies()) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private String extractClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private String truncate(String s, int maxLength) {
        if (s == null) return null;
        return s.length() <= maxLength ? s : s.substring(0, maxLength);
    }
}
