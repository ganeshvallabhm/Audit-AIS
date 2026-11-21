package io.companyaudit.platform;

import io.companyaudit.platform.util.AuditHashCalculator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AuditHashParityTest {

    @Test
    @DisplayName("Verify exact SHA-256 canonical JSON hash parity with Python backend")
    void testAuditHashParityWithPython() {
        // Python expected output:
        // Canonical JSON: {"action":"Executed sign-off","actor_user_id":"c1f7274b-5136-4c40-bbd9-95a94a2ee6f8","category":"Sign-Off","changes":{"status":"Closed"},"company_id":"a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d","entity_id":"f1e2d3c4-b5a6-7890-1234-56789abcdef0","entity_ref":"FND-1021","entity_type":"Finding","module":"Findings","prev_event_sha256":null}
        // Expected SHA-256: b382bad06180452049981b19046ee5624c401dbcc6fa62bff3a5068f4124b938

        Map<String, Object> changes = new HashMap<>();
        changes.put("status", "Closed");

        Map<String, Object> payload = new HashMap<>();
        payload.put("action", "Executed sign-off");
        payload.put("actor_user_id", "c1f7274b-5136-4c40-bbd9-95a94a2ee6f8");
        payload.put("category", "Sign-Off");
        payload.put("changes", changes);
        payload.put("company_id", "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d");
        payload.put("entity_id", "f1e2d3c4-b5a6-7890-1234-56789abcdef0");
        payload.put("entity_ref", "FND-1021");
        payload.put("entity_type", "Finding");
        payload.put("module", "Findings");
        payload.put("prev_event_sha256", null);

        String canonicalJson = AuditHashCalculator.computeCanonicalJson(payload);
        String calculatedSha = AuditHashCalculator.computeEventSha256(payload);

        String expectedJson = "{\"action\":\"Executed sign-off\",\"actor_user_id\":\"c1f7274b-5136-4c40-bbd9-95a94a2ee6f8\",\"category\":\"Sign-Off\",\"changes\":{\"status\":\"Closed\"},\"company_id\":\"a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d\",\"entity_id\":\"f1e2d3c4-b5a6-7890-1234-56789abcdef0\",\"entity_ref\":\"FND-1021\",\"entity_type\":\"Finding\",\"module\":\"Findings\",\"prev_event_sha256\":null}";
        String expectedSha = "b382bad06180452049981b19046ee5624c401dbcc6fa62bff3a5068f4124b938";

        assertEquals(expectedJson, canonicalJson, "Canonical JSON string representation must match Python separators and sorting");
        assertEquals(expectedSha, calculatedSha, "Computed SHA-256 digest must match Python output identically");
    }
}
