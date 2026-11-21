package io.companyaudit.platform.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

/**
 * Implements canonical JSON serialization and SHA-256 calculation
 * strictly matching Python's compute_event_sha256 in app/core/security.py:
 * canonical = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":")).encode("utf-8")
 * hashlib.sha256(canonical).hexdigest()
 *
 * Implemented using pure standard Java 17 (zero external dependencies)
 * to guarantee deterministic cross-platform parity and standalone testability.
 */
public final class AuditHashCalculator {

    private AuditHashCalculator() {}

    /**
     * Serializes any map or object structure into canonical JSON string
     * with lexicographically sorted keys, compact separators (",", ":"),
     * ensure_ascii=True (matching Python default json.dumps behavior),
     * and string conversion for non-standard types (matching Python default=str).
     */
    public static String computeCanonicalJson(Object obj) {
        StringBuilder sb = new StringBuilder();
        serializeValue(obj, sb);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void serializeValue(Object value, StringBuilder sb) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof Boolean) {
            sb.append(value);
        } else if (value instanceof Number) {
            sb.append(value);
        } else if (value instanceof String) {
            escapeJsonString((String) value, sb);
        } else if (value instanceof Map) {
            Map<?, ?> map = (Map<?, ?>) value;
            // Sort keys lexicographically (ASCII order matching Python sort_keys=True)
            Map<String, Object> sortedMap = new TreeMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                String keyStr = String.valueOf(entry.getKey());
                sortedMap.put(keyStr, entry.getValue());
            }

            sb.append('{');
            boolean first = true;
            for (Map.Entry<String, Object> entry : sortedMap.entrySet()) {
                if (!first) {
                    sb.append(',');
                }
                escapeJsonString(entry.getKey(), sb);
                sb.append(':');
                serializeValue(entry.getValue(), sb);
                first = false;
            }
            sb.append('}');
        } else if (value instanceof Collection) {
            sb.append('[');
            boolean first = true;
            for (Object item : (Collection<?>) value) {
                if (!first) {
                    sb.append(',');
                }
                serializeValue(item, sb);
                first = false;
            }
            sb.append(']');
        } else if (value.getClass().isArray()) {
            sb.append('[');
            int length = java.lang.reflect.Array.getLength(value);
            for (int i = 0; i < length; i++) {
                if (i > 0) {
                    sb.append(',');
                }
                serializeValue(java.lang.reflect.Array.get(value, i), sb);
            }
            sb.append(']');
        } else {
            // Python default=str behavior
            escapeJsonString(String.valueOf(value), sb);
        }
    }

    private static void escapeJsonString(String s, StringBuilder sb) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20 || c > 0x7E) {
                        // Python ensure_ascii=True escapes non-ASCII characters and controls
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }

    /**
     * Computes the SHA-256 hash matching Python's hashlib.sha256(canonical).hexdigest()
     */
    public static String computeEventSha256(Map<String, Object> payload) {
        String canonicalJson = computeCanonicalJson(payload);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(canonicalJson.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", e);
        }
    }
}
