package io.companyaudit.platform.security;

import io.companyaudit.platform.domain.CompanyEntity;
import io.companyaudit.platform.domain.DepartmentEntity;
import io.companyaudit.platform.domain.RefreshSessionEntity;
import io.companyaudit.platform.domain.UserEntity;
import io.companyaudit.platform.dto.request.LoginRequest;
import io.companyaudit.platform.dto.response.MessageResponse;
import io.companyaudit.platform.dto.response.TokenResponse;
import io.companyaudit.platform.repository.DepartmentRepository;
import io.companyaudit.platform.repository.RefreshSessionRepository;
import io.companyaudit.platform.repository.UserRepository;
import io.companyaudit.platform.service.AuthService;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Step 5: Mandatory Authentication & Security Suite")
class AuthenticationSecurityTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private DepartmentRepository departmentRepository;

    @Mock
    private RefreshSessionRepository refreshSessionRepository;

    private Argon2PasswordEncoder passwordEncoder;
    private JwtTokenProvider jwtTokenProvider;
    private RateLimitingService rateLimitingService;
    private AuthService authService;
    private CsrfDoubleSubmitFilter csrfFilter;

    private final UUID companyId1 = UUID.randomUUID();
    private final UUID companyId2 = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID deptId = UUID.randomUUID();
    private final String userEmail = "auditor.test@companyaudit.io";
    private final String rawPassword = "AuditSecurity2026!Key";
    private String hashedPassword;

    @BeforeEach
    void setUp() {
        passwordEncoder = new Argon2PasswordEncoder(16, 32, 4, 65536, 3);
        hashedPassword = passwordEncoder.encode(rawPassword);

        String jwtSecret = "companyaudit_enterprise_secure_secret_key_2026_test_32bytes";
        jwtTokenProvider = new JwtTokenProvider(jwtSecret, 30, 7);
        rateLimitingService = new RateLimitingService();

        authService = new AuthService(
                userRepository,
                departmentRepository,
                refreshSessionRepository,
                passwordEncoder,
                jwtTokenProvider,
                rateLimitingService,
                false,
                7
        );

        csrfFilter = new CsrfDoubleSubmitFilter("http://localhost:5173,http://localhost:5174");
    }

    private UserEntity createActiveUser(UUID companyId) {
        UserEntity user = new UserEntity();
        user.setId(userId);
        user.setCompanyId(companyId);
        user.setDepartmentId(deptId);
        user.setEmail(userEmail);
        user.setPasswordHash(hashedPassword);
        user.setFullName("Marcus Chen");
        user.setRole("Auditor");
        user.setTokenVersion(1);
        user.setIsActive(true);
        return user;
    }

    @Nested
    @DisplayName("1. Login & Credential Verification")
    class LoginTests {

        @Test
        @DisplayName("Test 1: Valid Login - Successful authentication and session establishment")
        void testValidLogin() {
            UserEntity user = createActiveUser(companyId1);
            DepartmentEntity dept = new DepartmentEntity();
            dept.setId(deptId);
            dept.setName("Information Security");

            when(userRepository.findByEmailIgnoreCase(userEmail)).thenReturn(Optional.of(user));
            when(departmentRepository.findById(deptId)).thenReturn(Optional.of(dept));

            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpServletResponse response = new MockHttpServletResponse();

            LoginRequest loginRequest = new LoginRequest(userEmail, rawPassword);
            TokenResponse tokenResponse = authService.login(loginRequest, request, response);

            assertNotNull(tokenResponse);
            assertNotNull(tokenResponse.getAccessToken());
            assertEquals(1800, tokenResponse.getExpiresIn());
            assertEquals("bearer", tokenResponse.getTokenType());
            assertEquals("Marcus Chen", tokenResponse.getUser().getFullName());
            assertEquals("MC", tokenResponse.getUser().getInitials());
            assertEquals("Information Security", tokenResponse.getUser().getDepartmentName());

            // Verify cookies
            Cookie refreshCookie = response.getCookie(AuthService.REFRESH_COOKIE_NAME);
            Cookie csrfCookie = response.getCookie(AuthService.CSRF_COOKIE_NAME);
            assertNotNull(refreshCookie);
            assertTrue(refreshCookie.isHttpOnly());
            assertNotNull(csrfCookie);
            assertFalse(csrfCookie.isHttpOnly());

            verify(refreshSessionRepository, times(1)).save(any(RefreshSessionEntity.class));
        }

        @Test
        @DisplayName("Test 2: Invalid Password - Rejection with 401 Unauthorized")
        void testInvalidPassword() {
            UserEntity user = createActiveUser(companyId1);
            when(userRepository.findByEmailIgnoreCase(userEmail)).thenReturn(Optional.of(user));

            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpServletResponse response = new MockHttpServletResponse();

            LoginRequest loginRequest = new LoginRequest(userEmail, "WrongPassword123!");

            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> authService.login(loginRequest, request, response));
            assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
            assertEquals("Invalid email or password.", ex.getReason());
        }

        @Test
        @DisplayName("Test 3: Unknown User - Rejection with 401 Unauthorized")
        void testUnknownUser() {
            when(userRepository.findByEmailIgnoreCase("unknown@companyaudit.io")).thenReturn(Optional.empty());

            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpServletResponse response = new MockHttpServletResponse();

            LoginRequest loginRequest = new LoginRequest("unknown@companyaudit.io", rawPassword);

            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> authService.login(loginRequest, request, response));
            assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
            assertEquals("Invalid email or password.", ex.getReason());
        }

        @Test
        @DisplayName("Test 4: Disabled User - Rejection with 403 Forbidden")
        void testDisabledUser() {
            UserEntity user = createActiveUser(companyId1);
            user.setIsActive(false);
            when(userRepository.findByEmailIgnoreCase(userEmail)).thenReturn(Optional.of(user));

            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpServletResponse response = new MockHttpServletResponse();

            LoginRequest loginRequest = new LoginRequest(userEmail, rawPassword);

            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> authService.login(loginRequest, request, response));
            assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
            assertEquals("Account is deactivated. Contact your organization Administrator.", ex.getReason());
        }

        @Test
        @DisplayName("Test 5: Account Lockout - Lockout after 5 consecutive failed attempts")
        void testAccountLockout() {
            UserEntity user = createActiveUser(companyId1);
            when(userRepository.findByEmailIgnoreCase(userEmail)).thenReturn(Optional.of(user));

            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpServletResponse response = new MockHttpServletResponse();

            LoginRequest badRequest = new LoginRequest(userEmail, "WrongPass!");

            // 5 failed login attempts
            for (int i = 0; i < 5; i++) {
                assertThrows(ResponseStatusException.class,
                        () -> authService.login(badRequest, request, response));
            }

            // 6th attempt is locked
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> authService.login(badRequest, request, response));
            assertEquals(HttpStatus.LOCKED, ex.getStatusCode());
            assertTrue(ex.getReason().contains("locked"));
        }
    }

    @Nested
    @DisplayName("2. JWT Signature & Token Lifecycle")
    class JwtValidationTests {

        @Test
        @DisplayName("Test 6: Expired JWT - Rejected during parsing")
        void testExpiredJwt() {
            SecretKey key = Keys.hmacShaKeyFor("companyaudit_enterprise_secure_secret_key_2026_test_32bytes".getBytes(StandardCharsets.UTF_8));
            String expiredToken = Jwts.builder()
                    .subject(userId.toString())
                    .claim("type", "access")
                    .issuedAt(Date.from(Instant.now().minusSeconds(3600)))
                    .expiration(Date.from(Instant.now().minusSeconds(1800)))
                    .signWith(key)
                    .compact();

            assertThrows(JwtException.class, () -> jwtTokenProvider.parseAndValidateToken(expiredToken, "access"));
        }

        @Test
        @DisplayName("Test 7: Invalid JWT Signature - Tampered token rejected")
        void testInvalidJwtSignature() {
            SecretKey differentKey = Keys.hmacShaKeyFor("different_signing_key_that_does_not_match_32bytes".getBytes(StandardCharsets.UTF_8));
            String tamperedToken = Jwts.builder()
                    .subject(userId.toString())
                    .claim("type", "access")
                    .issuedAt(Date.from(Instant.now()))
                    .expiration(Date.from(Instant.now().plusSeconds(1800)))
                    .signWith(differentKey)
                    .compact();

            assertThrows(JwtException.class, () -> jwtTokenProvider.parseAndValidateToken(tamperedToken, "access"));
        }
    }

    @Nested
    @DisplayName("3. Refresh Token Lifecycle, Family Rotation & Replay Theft Defense")
    class RefreshTokenTests {

        @Test
        @DisplayName("Test 8: Refresh-Token Rotation - Old session revoked, new session in same family")
        void testRefreshTokenRotation() {
            UserEntity user = createActiveUser(companyId1);
            UUID sessionId = UUID.randomUUID();
            UUID familyId = UUID.randomUUID();

            String refreshToken = jwtTokenProvider.createRefreshToken(userId, companyId1, 1, sessionId, familyId);
            String tokenHash = jwtTokenProvider.hashToken(refreshToken);

            RefreshSessionEntity session = new RefreshSessionEntity();
            session.setId(sessionId);
            session.setCompanyId(companyId1);
            session.setUserId(userId);
            session.setTokenFamily(familyId);
            session.setTokenHash(tokenHash);
            session.setExpiresAt(OffsetDateTime.now().plusDays(7));
            session.setRevokedAt(null);

            when(refreshSessionRepository.findByTokenHash(tokenHash)).thenReturn(Optional.of(session));
            when(userRepository.findById(userId)).thenReturn(Optional.of(user));

            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setCookies(new Cookie(AuthService.REFRESH_COOKIE_NAME, refreshToken));
            MockHttpServletResponse response = new MockHttpServletResponse();

            TokenResponse tokenResponse = authService.refresh(request, response);

            assertNotNull(tokenResponse);
            assertNotNull(tokenResponse.getAccessToken());
            assertNotNull(session.getRevokedAt()); // Old session marked revoked
            assertNotNull(session.getReplacedById()); // Linked to replacement session
            verify(refreshSessionRepository, times(2)).save(any(RefreshSessionEntity.class));
        }

        @Test
        @DisplayName("Test 9: Refresh-Token Reuse Detection - Invalidation of entire session family upon replay")
        void testRefreshTokenReuseDetection() {
            UserEntity user = createActiveUser(companyId1);
            UUID sessionId = UUID.randomUUID();
            UUID familyId = UUID.randomUUID();

            String reusedToken = jwtTokenProvider.createRefreshToken(userId, companyId1, 1, sessionId, familyId);
            String tokenHash = jwtTokenProvider.hashToken(reusedToken);

            RefreshSessionEntity alreadyRevokedSession = new RefreshSessionEntity();
            alreadyRevokedSession.setId(sessionId);
            alreadyRevokedSession.setCompanyId(companyId1);
            alreadyRevokedSession.setUserId(userId);
            alreadyRevokedSession.setTokenFamily(familyId);
            alreadyRevokedSession.setTokenHash(tokenHash);
            alreadyRevokedSession.setExpiresAt(OffsetDateTime.now().plusDays(7));
            alreadyRevokedSession.setRevokedAt(OffsetDateTime.now().minusMinutes(5)); // ALREADY REVOKED!

            when(refreshSessionRepository.findByTokenHash(tokenHash)).thenReturn(Optional.of(alreadyRevokedSession));
            when(userRepository.findById(userId)).thenReturn(Optional.of(user));

            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setCookies(new Cookie(AuthService.REFRESH_COOKIE_NAME, reusedToken));
            MockHttpServletResponse response = new MockHttpServletResponse();

            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> authService.refresh(request, response));

            assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
            assertTrue(ex.getReason().contains("reuse detected"));

            // Must revoke all tokens in family and increment token version
            verify(refreshSessionRepository, times(1)).revokeAllInFamily(eq(familyId), any(OffsetDateTime.class));
            assertEquals(2, user.getTokenVersion()); // Invalidation of all outstanding access tokens!
        }

        @Test
        @DisplayName("Test 10: Logout & Token Revocation - Immediate session invalidation and version increment")
        void testLogoutAndTokenRevocation() {
            UserEntity user = createActiveUser(companyId1);
            when(userRepository.findById(userId)).thenReturn(Optional.of(user));

            UserPrincipal principal = UserPrincipal.create(user);
            MockHttpServletResponse response = new MockHttpServletResponse();

            MessageResponse logoutResponse = authService.logout(principal, response);

            assertEquals("Logged out successfully", logoutResponse.getMessage());
            assertEquals(2, user.getTokenVersion());
            verify(refreshSessionRepository, times(1)).revokeAllForUser(eq(companyId1), eq(userId), any(OffsetDateTime.class));

            // Verify cookies cleared
            Cookie refreshCookie = response.getCookie(AuthService.REFRESH_COOKIE_NAME);
            assertNotNull(refreshCookie);
            assertEquals(0, refreshCookie.getMaxAge());
        }
    }

    @Nested
    @DisplayName("4. CSRF & Origin Security Controls")
    class CsrfAndOriginTests {

        @Test
        @DisplayName("Test 11: CSRF Double-Submit Validation - Missing or mismatching CSRF token rejected")
        void testCsrfValidationMismatch() throws ServletException, IOException {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/refresh");
            request.setCookies(new Cookie(CsrfDoubleSubmitFilter.CSRF_COOKIE_NAME, "valid_cookie_token_123"));
            request.addHeader(CsrfDoubleSubmitFilter.CSRF_HEADER_NAME, "mismatched_header_token_456");

            MockHttpServletResponse response = new MockHttpServletResponse();
            FilterChain chain = mock(FilterChain.class);

            csrfFilter.doFilter(request, response, chain);

            assertEquals(403, response.getStatus());
            assertTrue(response.getContentAsString().contains("CSRF verification token"));
            verify(chain, never()).doFilter(request, response);
        }

        @Test
        @DisplayName("Test 12: Origin Validation - Request from untrusted external origin rejected")
        void testUntrustedOriginRejected() throws ServletException, IOException {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/refresh");
            request.addHeader("Origin", "http://malicious-phishing-site.com");

            MockHttpServletResponse response = new MockHttpServletResponse();
            FilterChain chain = mock(FilterChain.class);

            csrfFilter.doFilter(request, response, chain);

            assertEquals(403, response.getStatus());
            assertTrue(response.getContentAsString().contains("Untrusted request origin"));
            verify(chain, never()).doFilter(request, response);
        }
    }

    @Nested
    @DisplayName("5. Authorization & Multi-Tenant Isolation")
    class MultiTenantAndRbacTests {

        @Test
        @DisplayName("Test 13: Unauthorized Role Access - Viewer role denied for Admin endpoints")
        void testUnauthorizedRoleAccess() {
            UserEntity viewer = createActiveUser(companyId1);
            viewer.setRole("Viewer");
            UserPrincipal principal = UserPrincipal.create(viewer);

            assertTrue(principal.getAuthorities().stream().noneMatch(a -> a.getAuthority().equals("ROLE_Admin")));
            assertTrue(principal.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_Viewer")));
        }

        @Test
        @DisplayName("Test 14: Cross-Company Data Isolation - Token from Company A rejected for Company B resources")
        void testCrossCompanyDataIsolation() {
            UserEntity userCompanyA = createActiveUser(companyId1);
            UUID sessionId = UUID.randomUUID();
            UUID familyId = UUID.randomUUID();

            // Refresh token issued for Company A
            String refreshTokenCompA = jwtTokenProvider.createRefreshToken(userId, companyId1, 1, sessionId, familyId);
            String tokenHash = jwtTokenProvider.hashToken(refreshTokenCompA);

            // User record moved or belonging to Company B
            UserEntity userCompanyB = createActiveUser(companyId2);

            RefreshSessionEntity session = new RefreshSessionEntity();
            session.setId(sessionId);
            session.setCompanyId(companyId1);
            session.setUserId(userId);
            session.setTokenFamily(familyId);
            session.setTokenHash(tokenHash);
            session.setExpiresAt(OffsetDateTime.now().plusDays(7));

            when(refreshSessionRepository.findByTokenHash(tokenHash)).thenReturn(Optional.of(session));
            when(userRepository.findById(userId)).thenReturn(Optional.of(userCompanyB));

            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setCookies(new Cookie(AuthService.REFRESH_COOKIE_NAME, refreshTokenCompA));
            MockHttpServletResponse response = new MockHttpServletResponse();

            // Attempting to refresh Company A token against Company B user must fail with 401
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> authService.refresh(request, response));
            assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
        }
    }
}
