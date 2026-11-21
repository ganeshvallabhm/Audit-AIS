# Enterprise Security Architecture & Migration Plan
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Target Security Framework:** Spring Security 6.4.x | Bouncy Castle | JJWT 0.12.x  
**Security Standard:** OWASP Top 10 | SOC 2 Type II | ISO/IEC 27001 Fiduciary Controls  
**Document Classification:** Cryptographic & Security Parity Technical Blueprint  

---

## 1. Authentication & Cryptographic Parity

### 1.1 Password Hashing Compatibility (Argon2id)

The existing Python backend hashes credentials using `pwdlib.PasswordHash` with `Argon2Hasher` conforming to the OWASP Password Storage Cheat Sheet. To ensure existing users can log in without password resets, Spring Security must be configured with identical parameters:

#### Parameter Parity Matrix

| Parameter | Python (`pwdlib`) Setting | Java (`Argon2PasswordEncoder`) Setting | Compatibility Status |
| :--- | :--- | :--- | :--- |
| **Algorithm Variant** | Argon2id (`$argon2id$...`) | Argon2id (`Argon2PasswordEncoder`) | **Identical** |
| **Salt Length** | 16 bytes | 16 bytes (`saltLength = 16`) | **Identical** |
| **Hash Length** | 32 bytes | 32 bytes (`hashLength = 32`) | **Identical** |
| **Parallelism ($p$)**| 4 lanes | 4 lanes (`parallelism = 4`) | **Identical** |
| **Memory Cost ($m$)**| 65536 KiB (64 MiB) | 65536 KiB (`memory = 65536`) | **Identical** |
| **Iterations ($t$)** | 3 passes | 3 passes (`iterations = 3`) | **Identical** |

#### Spring Security Bean Definition

```java
package io.companyaudit.platform.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class PasswordEncoderConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        // saltLength: 16, hashLength: 32, parallelism: 4, memory: 65536 KiB, iterations: 3
        return new Argon2PasswordEncoder(16, 32, 4, 65536, 3);
    }
}
```

---

## 2. JWT Architecture & Token Lifecycle

### 2.1 Token Signing & Claims Schema

The Java backend must emit and parse HS256 tokens using the identical claim structure:

```json
{
  "sub": "c1f7274b-5136-4c40-bbd9-95a94a2ee6f8",
  "cid": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "role": "Admin",
  "ver": 1,
  "type": "access",
  "jti": "8f9a2e4b-7c1d-4e9f-8a2b-3c4d5e6f7a8b",
  "iat": 1732185600,
  "exp": 1732187400
}
```

#### JWT Provider Implementation (JJWT)

```java
package io.companyaudit.platform.security;

import io.companyaudit.platform.config.ApplicationProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtTokenProvider {

    private final SecretKey secretKey;
    private final int accessExpiryMinutes;
    private final int refreshExpiryDays;

    public JwtTokenProvider(ApplicationProperties properties) {
        byte[] keyBytes = properties.getSecurity().getJwtSecretKey().getBytes(StandardCharsets.UTF_8);
        this.secretKey = Keys.hmacShaKeyFor(keyBytes);
        this.accessExpiryMinutes = properties.getSecurity().getAccessTokenExpireMinutes();
        this.refreshExpiryDays = properties.getSecurity().getRefreshTokenExpireDays();
    }

    public String createAccessToken(UUID userId, UUID companyId, String role, int tokenVersion) {
        Instant now = Instant.now();
        Instant expiry = now.plus(accessExpiryMinutes, ChronoUnit.MINUTES);

        return Jwts.builder()
                .subject(userId.toString())
                .claim("cid", companyId.toString())
                .claim("role", role)
                .claim("ver", tokenVersion)
                .claim("type", "access")
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(secretKey)
                .compact();
    }

    public String createRefreshToken(UUID userId, UUID companyId, int tokenVersion, UUID sessionId, UUID tokenFamily) {
        Instant now = Instant.now();
        Instant expiry = now.plus(refreshExpiryDays, ChronoUnit.DAYS);

        return Jwts.builder()
                .subject(userId.toString())
                .claim("cid", companyId.toString())
                .claim("ver", tokenVersion)
                .claim("type", "refresh")
                .claim("fam", tokenFamily.toString())
                .id(sessionId.toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(secretKey)
                .compact();
    }

    public Claims parseAndValidateToken(String token, String expectedType) {
        Claims claims = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        String type = claims.get("type", String.class);
        if (!expectedType.equals(type)) {
            throw new IllegalArgumentException("Unexpected token type: " + type);
        }
        return claims;
    }
}
```

---

## 3. Refresh-Token Rotation & Theft Detection

### 3.1 Token Family & Session Revocation Algorithm

When `POST /api/auth/refresh` is executed:
1. **Hash Verification:** Compute SHA-256 hash of the presented refresh token. Look up `RefreshSessionEntity` by `token_hash`.
2. **Replay Detection (Theft Condition):**
   - If `revoked_at IS NOT NULL`, the token was already rotated and has been presented again (token theft attempt).
   - **Breach Response:**
     1. Revoke all active sessions belonging to the same `token_family`:
        `UPDATE refresh_sessions SET revoked_at = NOW() WHERE token_family = :family AND revoked_at IS NULL`
     2. Increment `user.token_version` by 1 (instantly invalidating all existing in-memory access tokens).
     3. Append a security event to `audit_history` ("Detected refresh token reuse; revoked full session family").
     4. Clear client cookies and return `HTTP 401 Unauthorized`.
3. **Atomic Rotation (Normal Condition):**
   - If `revoked_at IS NULL` and `expires_at > NOW()`:
     1. Mark the presented session as revoked: `revoked_at = NOW()`, `replaced_by_id = newSession.id`.
     2. Insert `newSession` into `refresh_sessions` inheriting the same `token_family`.
     3. Mint a fresh access JWT and set rotated cookies.

---

## 4. Double-Submit CSRF & Origin Defense

### 4.1 Cookie & Header Contract

The React application uses a non-HttpOnly readable cookie `companyaudit_csrf` and injects its value into the `X-CSRF-Token` header.

#### CSRF Verification Filter in Spring Security

```java
package io.companyaudit.platform.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.crypto.codec.Utf8;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Set;

public class DoubleSubmitCsrfFilter extends OncePerRequestFilter {

    private static final Set<String> CSRF_PROTECTED_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();
        String method = request.getMethod().toUpperCase();

        // Check if CSRF validation is required
        boolean isRefreshOrLogout = path.endsWith("/auth/refresh") || path.endsWith("/auth/logout");
        boolean isStateChanging = CSRF_PROTECTED_METHODS.contains(method);

        if (isRefreshOrLogout || isStateChanging) {
            String csrfCookie = getCookieValue(request, "companyaudit_csrf");
            
            // Only enforce if the CSRF cookie is present (allows unauthenticated initial login)
            if (csrfCookie != null) {
                String csrfHeader = request.getHeader("X-CSRF-Token");
                if (csrfHeader == null || !constantTimeEquals(csrfCookie, csrfHeader)) {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json");
                    response.getWriter().write("{\"detail\":\"CSRF validation failed or token mismatched.\"}");
                    return;
                }
            }
        }

        filterChain.doFilter(request, response);
    }

    private String getCookieValue(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        return Arrays.stream(request.getCookies())
                .filter(c -> name.equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private boolean constantTimeEquals(String expected, String actual) {
        return MessageDigest.isEqual(Utf8.encode(expected), Utf8.encode(actual));
    }
}
```

---

## 5. Multi-Tenant Row Isolation & Role-Based Access Control

### 5.1 Five-Role Authorization Matrix

Spring Security method-level annotations enforce role permissions:

```java
@PreAuthorize("hasRole('Admin')")
@PostMapping("/auth/register")
public ResponseEntity<UserSummary> registerUser(...) { ... }

@PreAuthorize("hasAnyRole('Admin', 'Auditor')")
@PostMapping("/audits/{id}/responses")
public ResponseEntity<SubmitAuditResponsesResult> submitResponses(...) { ... }

@PreAuthorize("hasAnyRole('Admin', 'Management')")
@PutMapping("/company")
public ResponseEntity<CompanyProfileOut> updateCompany(...) { ... }
```

### 5.2 Department-Head Row Confinement

Department heads can only mutate findings, corrective actions, and evidence within their assigned department. In Java, this is enforced via a reusable programmatic guard:

```java
package io.companyaudit.platform.security;

import io.companyaudit.platform.common.exception.ForbiddenException;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class SecurityGuard {

    public void ensureDepartmentScope(CustomUserPrincipal principal, UUID targetDepartmentId) {
        if ("Department Head".equals(principal.getRole())) {
            if (principal.getDepartmentId() == null || !principal.getDepartmentId().equals(targetDepartmentId)) {
                throw new ForbiddenException("Department Heads can only modify records belonging to their assigned department.");
            }
        }
    }
}
```

---

## 6. Evidence Vault & Integrity Controls

### 6.1 MIME & Magic-Byte Inspection

Uploaded files are verified using Apache Tika to prevent executable spoofing:

```java
package io.companyaudit.platform.service;

import io.companyaudit.platform.common.exception.UnsupportedMediaTypeException;
import org.apache.tika.Tika;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.Map;
import java.util.Set;

@Service
public class FileValidationService {

    private final Tika tika = new Tika();

    private static final Map<String, Set<String>> ALLOWED_EXTENSIONS = Map.of(
        ".pdf", Set.of("application/pdf"),
        ".png", Set.of("image/png"),
        ".jpg", Set.of("image/jpeg"),
        ".jpeg", Set.of("image/jpeg"),
        ".xlsx", Set.of("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"),
        ".csv", Set.of("text/csv", "text/plain")
    );

    public void validateMagicBytes(String extension, InputStream stream) throws Exception {
        String detectedMime = tika.detect(stream);
        Set<String> allowedMimes = ALLOWED_EXTENSIONS.get(extension.toLowerCase());

        if (allowedMimes == null || !allowedMimes.contains(detectedMime)) {
            throw new UnsupportedMediaTypeException("Uploaded file magic bytes do not match expected signature for " + extension);
        }
    }
}
```

### 6.2 Enterprise SHA Lock

When modifying evidence links (`audit_id`, `finding_id`, `corrective_action_id`), the service verifies:
```java
if (Boolean.TRUE.equals(company.getShaLockEnabled()) && "Verified".equals(evidence.getVerificationStatus())) {
    throw new BadRequestException("Cannot re-link or modify evidence artifact locked under enterprise SHA policy.");
}
```

---

## 7. Cryptographic Audit Log Chaining

The `audit_history` table implements an append-only hash chain:

$$\text{event\_sha256} = \text{SHA256}(\text{canonical\_json}(\text{payload} + \text{prev\_event\_sha256}))$$

### 7.1 Canonical JSON Serialization

To ensure Java produces the identical hash as Python's `json.dumps(..., separators=(',', ':'), sort_keys=True)`:

```java
package io.companyaudit.platform.common.util;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;

public class CryptographicHashUtils {

    private static final ObjectMapper CANONICAL_MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true)
            .configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);

    public static String computeCanonicalSha256(Map<String, Object> payload) {
        try {
            byte[] canonicalBytes = CANONICAL_MAPPER.writeValueAsBytes(payload);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(canonicalBytes);
            return HexFormat.of().formatHex(hashBytes);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to compute canonical audit hash", e);
        }
    }
}
```
