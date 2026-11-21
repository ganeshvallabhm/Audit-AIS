package io.companyaudit.platform.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.HexFormat;
import java.util.UUID;

@Component
public class JwtTokenProvider {

    private final SecretKey signingKey;
    private final Duration accessTokenExpiration;
    private final Duration refreshTokenExpiration;

    public JwtTokenProvider(
            @Value("${app.security.jwt-secret-key:default_insecure_key_for_development_replace_in_prod_at_least_32_chars}") String secret,
            @Value("${app.security.access-token-expire-minutes:30}") long accessMinutes,
            @Value("${app.security.refresh-token-expire-days:7}") long refreshDays) {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            byte[] padded = new byte[32];
            System.arraycopy(keyBytes, 0, padded, 0, keyBytes.length);
            this.signingKey = Keys.hmacShaKeyFor(padded);
        } else {
            this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        }
        this.accessTokenExpiration = Duration.ofMinutes(accessMinutes);
        this.refreshTokenExpiration = Duration.ofDays(refreshDays);
    }

    public String createAccessToken(UUID userId, UUID companyId, String role, int tokenVersion) {
        Instant now = Instant.now();
        Instant expiry = now.plus(accessTokenExpiration);

        return Jwts.builder()
                .subject(userId.toString())
                .claim("cid", companyId.toString())
                .claim("role", role)
                .claim("ver", tokenVersion)
                .claim("type", "access")
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(signingKey)
                .compact();
    }

    public String createRefreshToken(UUID userId, UUID companyId, int tokenVersion, UUID sessionId, UUID tokenFamily) {
        Instant now = Instant.now();
        Instant expiry = now.plus(refreshTokenExpiration);

        return Jwts.builder()
                .subject(userId.toString())
                .claim("cid", companyId.toString())
                .claim("ver", tokenVersion)
                .claim("type", "refresh")
                .id(sessionId != null ? sessionId.toString() : UUID.randomUUID().toString())
                .claim("fam", tokenFamily != null ? tokenFamily.toString() : UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(signingKey)
                .compact();
    }

    public Claims parseAndValidateToken(String token, String expectedType) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            String tokenType = claims.get("type", String.class);
            if (expectedType != null && !expectedType.equals(tokenType)) {
                throw new JwtException("Invalid token type. Expected: " + expectedType + " but found: " + tokenType);
            }

            return claims;
        } catch (JwtException | IllegalArgumentException e) {
            throw new JwtException("Invalid or expired JWT token: " + e.getMessage(), e);
        }
    }

    public String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", e);
        }
    }

    public Duration getAccessTokenExpiration() {
        return accessTokenExpiration;
    }
}
