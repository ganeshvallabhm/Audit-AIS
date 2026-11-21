package io.companyaudit.platform.security;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RateLimitingService {

    private final Map<String, Deque<Long>> rateBuckets = new ConcurrentHashMap<>();
    private final Map<String, Integer> failedAttempts = new ConcurrentHashMap<>();
    private final Map<String, Instant> lockouts = new ConcurrentHashMap<>();

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final long LOCKOUT_DURATION_MINUTES = 15;

    public boolean isAllowed(String key, int maxRequests, int windowSeconds) {
        long now = System.currentTimeMillis();
        long windowMillis = windowSeconds * 1000L;
        long cutoff = now - windowMillis;

        Deque<Long> timestamps = rateBuckets.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (timestamps) {
            while (!timestamps.isEmpty() && timestamps.peekFirst() < cutoff) {
                timestamps.pollFirst();
            }
            if (timestamps.size() >= maxRequests) {
                return false;
            }
            timestamps.addLast(now);
            return true;
        }
    }

    public void reset(String key) {
        rateBuckets.remove(key);
    }

    public boolean isAccountLocked(String email) {
        if (email == null) return false;
        String normalized = email.trim().toLowerCase();
        Instant lockedUntil = lockouts.get(normalized);
        if (lockedUntil == null) {
            return false;
        }
        if (Instant.now().isAfter(lockedUntil)) {
            lockouts.remove(normalized);
            failedAttempts.remove(normalized);
            return false;
        }
        return true;
    }

    public void recordFailedLogin(String email) {
        if (email == null) return;
        String normalized = email.trim().toLowerCase();
        int attempts = failedAttempts.compute(normalized, (k, v) -> v == null ? 1 : v + 1);
        if (attempts >= MAX_FAILED_ATTEMPTS) {
            lockouts.put(normalized, Instant.now().plusSeconds(LOCKOUT_DURATION_MINUTES * 60));
        }
    }

    public void recordSuccessfulLogin(String email) {
        if (email == null) return;
        String normalized = email.trim().toLowerCase();
        failedAttempts.remove(normalized);
        lockouts.remove(normalized);
    }

    public int getFailedAttempts(String email) {
        if (email == null) return 0;
        return failedAttempts.getOrDefault(email.trim().toLowerCase(), 0);
    }
}
