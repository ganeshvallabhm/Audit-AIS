package io.companyaudit.platform.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

@Component
public class CsrfDoubleSubmitFilter extends OncePerRequestFilter {

    public static final String CSRF_COOKIE_NAME = "companyaudit_csrf";
    public static final String CSRF_HEADER_NAME = "X-CSRF-Token";

    private final Set<String> allowedOrigins;

    public CsrfDoubleSubmitFilter(
            @Value("${app.security.cors-origins:http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:4173,http://127.0.0.1:4173}") String origins) {
        this.allowedOrigins = new HashSet<>(Arrays.asList(origins.split(",")));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();
        String method = request.getMethod();

        // Safe methods do not require CSRF
        if (HttpMethod.GET.matches(method) || HttpMethod.HEAD.matches(method) || HttpMethod.OPTIONS.matches(method)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Login is exempt from CSRF (initial session establishment)
        if (path.endsWith("/api/auth/login") || path.endsWith("/api/health")) {
            filterChain.doFilter(request, response);
            return;
        }

        // Validate Origin / Referer if present
        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isBlank()) {
            if (!allowedOrigins.contains(origin.trim())) {
                sendError(response, HttpServletResponse.SC_FORBIDDEN, "Untrusted request origin.");
                return;
            }
        } else {
            String referer = request.getHeader("Referer");
            if (referer != null && !referer.isBlank()) {
                try {
                    URI uri = URI.create(referer);
                    String refOrigin = uri.getScheme() + "://" + uri.getAuthority();
                    if (!allowedOrigins.contains(refOrigin)) {
                        sendError(response, HttpServletResponse.SC_FORBIDDEN, "Untrusted request referer.");
                        return;
                    }
                } catch (Exception ignored) {}
            }
        }

        // For endpoints that require CSRF (e.g. /api/auth/refresh, /api/auth/logout, or state mutations with cookie)
        String csrfCookie = extractCookie(request, CSRF_COOKIE_NAME);
        String csrfHeader = request.getHeader(CSRF_HEADER_NAME);

        // If CSRF cookie is present or endpoint is /api/auth/refresh or /api/auth/logout, validate CSRF token
        if (csrfCookie != null || path.endsWith("/api/auth/refresh") || path.endsWith("/api/auth/logout")) {
            if (csrfCookie == null || csrfHeader == null || !constantTimeEquals(csrfCookie, csrfHeader)) {
                sendError(response, HttpServletResponse.SC_FORBIDDEN, "Invalid or missing CSRF verification token.");
                return;
            }
        }

        filterChain.doFilter(request, response);
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

    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private void sendError(HttpServletResponse response, int status, String detail) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"detail\":\"" + detail + "\"}");
    }
}
