package io.companyaudit.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

@Service
public class EvidenceStorageService {

    public static final long MAX_EVIDENCE_BYTES = 26214400L; // 25 MB

    public static final Map<String, Set<String>> ALLOWED_EXTENSION_MIMES = Map.of(
            ".pdf", Set.of("application/pdf"),
            ".png", Set.of("image/png"),
            ".jpg", Set.of("image/jpeg"),
            ".jpeg", Set.of("image/jpeg"),
            ".csv", Set.of("text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"),
            ".json", Set.of("application/json", "text/json", "text/plain"),
            ".log", Set.of("text/plain", "application/octet-stream"),
            ".txt", Set.of("text/plain"),
            ".xlsx", Set.of("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"),
            ".docx", Set.of("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip")
    );

    public static final Set<String> BLOCKED_EXTENSIONS = Set.of(
            ".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".js", ".html", ".htm", ".svg", ".php"
    );

    private final Path evidenceRoot;

    public EvidenceStorageService(@Value("${app.storage.evidence-dir:./storage/evidence}") String storageDir) {
        this.evidenceRoot = Paths.get(storageDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.evidenceRoot);
        } catch (IOException e) {
            // directory creation handled when storage accessed
        }
    }

    public Path getEvidenceRoot() {
        return evidenceRoot;
    }

    public String sanitizeFilename(String originalName) {
        if (originalName == null || originalName.trim().isEmpty()) {
            return "evidence.bin";
        }
        String raw = originalName.replace('\\', '/');
        int lastSlash = raw.lastIndexOf('/');
        if (lastSlash >= 0) {
            raw = raw.substring(lastSlash + 1);
        }
        raw = raw.trim();

        StringBuilder sb = new StringBuilder();
        for (char ch : raw.toCharArray()) {
            if (Character.isLetterOrDigit(ch) || ch == '.' || ch == '_' || ch == '-') {
                sb.append(ch);
            } else {
                sb.append('_');
            }
        }
        String cleaned = sb.toString();
        if (cleaned.length() > 255) {
            cleaned = cleaned.substring(0, 255);
        }
        return cleaned.isEmpty() ? "evidence.bin" : cleaned;
    }

    public void validateMagicBytes(String ext, byte[] content) {
        if (content == null || content.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Uploaded evidence file cannot be empty.");
        }

        switch (ext) {
            case ".pdf":
                if (content.length < 5 || content[0] != '%' || content[1] != 'P' || content[2] != 'D' || content[3] != 'F' || content[4] != '-') {
                    throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "File content does not match PDF magic signature (%PDF-).");
                }
                break;
            case ".png":
                byte[] pngHeader = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
                if (content.length < pngHeader.length || !Arrays.equals(Arrays.copyOf(content, pngHeader.length), pngHeader)) {
                    throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "File content does not match PNG magic signature.");
                }
                break;
            case ".jpg":
            case ".jpeg":
                if (content.length < 3 || (content[0] & 0xFF) != 0xFF || (content[1] & 0xFF) != 0xD8 || (content[2] & 0xFF) != 0xFF) {
                    throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "File content does not match JPEG magic signature.");
                }
                break;
            case ".xlsx":
            case ".docx":
                if (content.length < 4 || content[0] != 'P' || content[1] != 'K' || content[2] != 0x03 || content[3] != 0x04) {
                    throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "File content does not match OOXML archive signature for " + ext + ".");
                }
                break;
            case ".csv":
            case ".json":
            case ".log":
            case ".txt":
                int sampleLen = Math.min(content.length, 4096);
                for (int i = 0; i < sampleLen; i++) {
                    if (content[i] == 0) {
                        throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Binary NUL bytes rejected in text evidence format " + ext + ".");
                    }
                }
                try {
                    String sample = new String(content, 0, sampleLen, StandardCharsets.UTF_8);
                    if (sample.contains("\uFFFD")) {
                        throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Text evidence format " + ext + " must be valid UTF-8.");
                    }
                } catch (Exception e) {
                    throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Text evidence format " + ext + " must be valid UTF-8.");
                }
                break;
            default:
                break;
        }
    }

    public StorageResult storeUploadedEvidence(MultipartFile file, UUID companyId) {
        String safeName = sanitizeFilename(file.getOriginalFilename());
        int dotIndex = safeName.lastIndexOf('.');
        String ext = dotIndex >= 0 ? safeName.substring(dotIndex).toLowerCase(Locale.ROOT) : "";

        if (BLOCKED_EXTENSIONS.contains(ext) || !ALLOWED_EXTENSION_MIMES.containsKey(ext)) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "File extension '" + (ext.isEmpty() ? "none" : ext) + "' is not permitted in the Evidence Vault.");
        }

        String declaredMime = (file.getContentType() != null ? file.getContentType() : "application/octet-stream")
                .split(";")[0].trim().toLowerCase(Locale.ROOT);
        Set<String> allowedMimes = ALLOWED_EXTENSION_MIMES.get(ext);
        if (!allowedMimes.contains(declaredMime) && !"application/octet-stream".equals(declaredMime)) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Content-Type '" + declaredMime + "' does not match allowed types for '" + ext + "'.");
        }

        byte[] payload;
        try {
            payload = file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to read uploaded file payload.", e);
        }

        long byteSize = payload.length;
        if (byteSize > MAX_EVIDENCE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "Evidence file exceeds maximum allowed size of " + MAX_EVIDENCE_BYTES + " bytes (25 MB).");
        }

        validateMagicBytes(ext, payload);

        String sha256Hex = computeSha256(payload);
        String storageKey = companyId.toString() + "/" + UUID.randomUUID() + ext;
        Path targetPath = resolveEvidencePath(storageKey);

        try {
            Files.createDirectories(targetPath.getParent());
            Files.write(targetPath, payload);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to persist evidence artifact to storage vault.", e);
        }

        String resolvedMime = !"application/octet-stream".equals(declaredMime) ? declaredMime : allowedMimes.iterator().next();
        return new StorageResult(safeName, storageKey, resolvedMime, byteSize, sha256Hex);
    }

    public Path resolveEvidencePath(String storageKey) {
        if (storageKey == null || storageKey.contains("..")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid storage key.");
        }
        Path target = evidenceRoot.resolve(storageKey).normalize();
        if (!target.startsWith(evidenceRoot)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Path traversal attempt detected in storage key.");
        }
        return target;
    }

    public boolean verifyStoredFileSha256(String storageKey, String expectedSha256) {
        Path target = resolveEvidencePath(storageKey);
        if (!Files.isRegularFile(target)) {
            return false;
        }
        try {
            byte[] bytes = Files.readAllBytes(target);
            String actualSha256 = computeSha256(bytes);
            return actualSha256.equalsIgnoreCase(expectedSha256);
        } catch (IOException e) {
            return false;
        }
    }

    public String computeSha256(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data);
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", e);
        }
    }

    public static class StorageResult {
        private final String originalFilename;
        private final String storageKey;
        private final String mimeType;
        private final long byteSize;
        private final String sha256Hash;

        public StorageResult(String originalFilename, String storageKey, String mimeType, long byteSize, String sha256Hash) {
            this.originalFilename = originalFilename;
            this.storageKey = storageKey;
            this.mimeType = mimeType;
            this.byteSize = byteSize;
            this.sha256Hash = sha256Hash;
        }

        public String getOriginalFilename() {
            return originalFilename;
        }

        public String getStorageKey() {
            return storageKey;
        }

        public String getMimeType() {
            return mimeType;
        }

        public long getByteSize() {
            return byteSize;
        }

        public String getSha256Hash() {
            return sha256Hash;
        }
    }
}
