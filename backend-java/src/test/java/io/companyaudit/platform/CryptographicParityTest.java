package io.companyaudit.platform;

import io.companyaudit.platform.util.AuditHashCalculator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Step 3: Cryptographic Parity Verification Suite")
public class CryptographicParityTest {

    private final Argon2PasswordEncoder passwordEncoder = new Argon2PasswordEncoder(16, 32, 4, 65536, 3);

    @Nested
    @DisplayName("Argon2id Password Hashing Parity")
    class Argon2idTests {

        // Generated directly by Python pwdlib / Argon2Hasher with t=3, m=65536, p=4
        private static final String PYTHON_ARGON2_HASH =
                "$argon2id$v=19$m=65536,t=3,p=4$NQz1Uuphv1eLte0ZzARJ0A$g4Co0bsRxTHQixYVX20OpMkZ1BMrQuZeA53XPrEQSUE";
        private static final String VALID_PASSWORD = "AuditDemo2026!Secure";

        @Test
        @DisplayName("Java Argon2PasswordEncoder verifies actual Python-generated hash")
        void testJavaVerifiesPythonArgon2Hash() {
            boolean matches = passwordEncoder.matches(VALID_PASSWORD, PYTHON_ARGON2_HASH);
            assertTrue(matches, "Spring Security Argon2PasswordEncoder must verify Python-generated Argon2id hash");
        }

        @Test
        @DisplayName("Java Argon2PasswordEncoder rejects incorrect password against Python hash")
        void testJavaRejectsWrongPassword() {
            boolean matches = passwordEncoder.matches("IncorrectPassword123!", PYTHON_ARGON2_HASH);
            assertFalse(matches, "Spring Security Argon2PasswordEncoder must reject invalid credentials");
        }

        @Test
        @DisplayName("Java Argon2PasswordEncoder generates valid hash matching OWASP parameters")
        void testJavaGeneratesCompliantHash() {
            String javaHash = passwordEncoder.encode(VALID_PASSWORD);
            assertTrue(javaHash.startsWith("$argon2id$v=19$m=65536,t=3,p=4$"),
                    "Java-generated hash must use identical PHC format and parameters");
            assertTrue(passwordEncoder.matches(VALID_PASSWORD, javaHash),
                    "Java-generated hash must verify successfully");
        }
    }

    @Nested
    @DisplayName("Audit Hash Chain Parity across Complex Data Types")
    class AuditHashChainTests {

        @Test
        @DisplayName("Vector 1: Nested JSON with null values")
        void testVector1NestedAndNulls() {
            Map<String, Object> nested = new LinkedHashMap<>();
            nested.put("b", 2);
            nested.put("a", 1);

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("action", "CREATE");
            payload.put("details", null);
            payload.put("nested", nested);

            String expectedCanonical = "{\"action\":\"CREATE\",\"details\":null,\"nested\":{\"a\":1,\"b\":2}}";
            String expectedSha = "021bb0ca5269436b0f8f564d134739b84fd9761145cd33a27ab9f021d38f7ff7";

            String actualCanonical = AuditHashCalculator.computeCanonicalJson(payload);
            String actualSha = AuditHashCalculator.computeEventSha256(payload);

            assertEquals(expectedCanonical, actualCanonical, "Vector 1 canonical JSON mismatch");
            assertEquals(expectedSha, actualSha, "Vector 1 SHA-256 mismatch");
        }

        @Test
        @DisplayName("Vector 2: Unicode (accents, Asian characters, emoji, special symbols)")
        void testVector2UnicodeAndSymbols() {
            Map<String, Object> payload = new LinkedHashMap<>();
            // "Café 中文 🔒", symbols "<>&\"'\\"
            payload.put("unicode", "Caf\u00e9 \u4e2d\u6587 \ud83d\udd12");
            payload.put("symbols", "<>&\"'\\");

            String expectedCanonical = "{\"symbols\":\"<>&\\\"'\\\\\",\"unicode\":\"Caf\\u00e9 \\u4e2d\\u6587 \\ud83d\\udd12\"}";
            String expectedSha = "654e72b89f666b3a5174ae1442f25b92d5a77fed4a7bfcdd8bc97a59d6bec31e";

            String actualCanonical = AuditHashCalculator.computeCanonicalJson(payload);
            String actualSha = AuditHashCalculator.computeEventSha256(payload);

            assertEquals(expectedCanonical, actualCanonical, "Vector 2 canonical JSON mismatch");
            assertEquals(expectedSha, actualSha, "Vector 2 SHA-256 mismatch");
        }

        @Test
        @DisplayName("Vector 3: Numeric types (int, float), booleans, empty maps")
        void testVector3NumericsAndBooleans() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("num_int", 42);
            payload.put("num_float", 98.75);
            payload.put("bool_val", true);
            payload.put("empty_map", new HashMap<>());

            String expectedCanonical = "{\"bool_val\":true,\"empty_map\":{},\"num_float\":98.75,\"num_int\":42}";
            String expectedSha = "8aeb4bfa552f3e6d439452057d8f562d91ecd31daac725ecc2162ae48df25330";

            String actualCanonical = AuditHashCalculator.computeCanonicalJson(payload);
            String actualSha = AuditHashCalculator.computeEventSha256(payload);

            assertEquals(expectedCanonical, actualCanonical, "Vector 3 canonical JSON mismatch");
            assertEquals(expectedSha, actualSha, "Vector 3 SHA-256 mismatch");
        }

        @Test
        @DisplayName("Vector 4: ISO-8601 Timestamps and null fields")
        void testVector4TimestampsAndNulls() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("timestamp", "2026-11-21T06:30:00Z");
            payload.put("null_field", null);

            String expectedCanonical = "{\"null_field\":null,\"timestamp\":\"2026-11-21T06:30:00Z\"}";
            String expectedSha = "3459ef9fd94be236844513a271d9c0fa4761683fda51ea0b06a78e5211ab5568";

            String actualCanonical = AuditHashCalculator.computeCanonicalJson(payload);
            String actualSha = AuditHashCalculator.computeEventSha256(payload);

            assertEquals(expectedCanonical, actualCanonical, "Vector 4 canonical JSON mismatch");
            assertEquals(expectedSha, actualSha, "Vector 4 SHA-256 mismatch");
        }
    }
}
