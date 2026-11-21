# Phase 4 Evidence Security Report: Threat Model, Storage Isolation & Integrity
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Target Architecture:** Java 17 LTS / Spring Boot 3.4.0 / Spring Security 6  
**Component:** Secure Evidence Vault (`EvidenceService`, `EvidenceStorageService`, `EvidenceController`)  
**Security Status:** ALL SECURITY CONTROLS VERIFIED  
**Date:** 2026-11-21  

---

## 1. Executive Summary

This report documents the security architecture, threat model, input sanitization, and cryptographic verification implemented in the **CompanyAudit Secure Evidence Vault** during Phase 4 of the Python-to-Java migration.

The Evidence Vault is a critical compliance component that stores sensitive audit workpapers, regulatory submissions, control screenshots, and test results. It must withstand attacks including path traversal, arbitrary file execution, quota exhaustion, cross-tenant data leaks, and evidence tampering.

The Java Spring Boot implementation preserves and enhances all security guarantees established by the Python FastAPI backend, backed by automated unit and security tests.

---

## 2. Threat Model & Defensive Controls Matrix

| Threat Category | Attack Vector / Scenario | Python Implementation | Java Implementation | Verified Defense |
| :--- | :--- | :--- | :--- | :---: |
| **Path Traversal** | Malicious filenames (e.g. `../../etc/passwd`, `..\\Windows\\System32`) | Strips directory paths via `os.path.basename` | `EvidenceStorageService.validateAndSanitizeFilename` removes separators, relative components, control chars, and reserved chars | **VERIFIED** |
| **Malware / Arbitrary Execution** | Renaming `.exe` to `.pdf` or embedding malicious scripts in uploads | Extension whitelist + magic-byte header inspection | Content-type whitelist + explicit magic-byte verification (PDF, PNG, JPEG, OOXML, UTF-8 text) | **VERIFIED** |
| **Denial of Service (DoS)** | Giant file upload exhausting disk or memory | Max upload size limit (25 MB) | Dual enforcement: HTTP request limit (25 MB) and streaming byte counter check | **VERIFIED** |
| **Multi-Tenant Leak** | Accessing evidence of another tenant via predictable ID guessing | SQLAlchemy query filter on `company_id` | Strict tenant filtering via Spring Security `UserPrincipal.companyId` returning `404 Not Found` | **VERIFIED** |
| **Evidence Tampering** | Modifying stored file contents on disk after upload | SHA-256 hash calculated during upload | SHA-256 stream hash during upload + on-demand disk re-verification (`/verify` endpoint) | **VERIFIED** |
| **Audit Workpaper Relinking** | Reassigning verified evidence to falsify audit trails | SHA-256 lock check on company | Enterprise SHA-Lock (`companies.sha_lock_enabled`): verified evidence is strictly immutable | **VERIFIED** |

---

## 3. Deep Dive: Security Mechanisms

### 3.1 25 MB Payload Limit Enforcement
Upload size limits are enforced at two independent architectural layers:
1. **Container / HTTP Layer (`application.yml`):**
   ```yaml
   spring:
     servlet:
       multipart:
         max-file-size: 25MB
         max-request-size: 25MB
   ```
   Requests exceeding 25 MB are rejected at the edge before payload consumption.
2. **Service Layer Byte Validation (`EvidenceStorageService.java`):**
   ```java
   public static final long MAX_FILE_SIZE = 25 * 1024 * 1024; // 26,214,400 bytes
   if (fileSize > MAX_FILE_SIZE) {
       throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "File size exceeds 25 MB limit");
   }
   ```
   Tested by `Phase4GovernanceAndEvidenceTest.test22_OversizedUploadRejection`.

### 3.2 Magic-Byte Inspection & File Whitelisting
To prevent spoofed file extensions, `EvidenceStorageService` inspects the initial header bytes of the uploaded stream:

| Allowed Format | Extensions | Magic-Byte Signature / Header |
| :--- | :--- | :--- |
| **PDF Document** | `.pdf` | `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`) |
| **PNG Image** | `.png` | `0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A` |
| **JPEG Image** | `.jpg`, `.jpeg` | `0xFF 0xD8 0xFF` |
| **MS Office OpenXML** | `.docx`, `.xlsx` | `PK\x03\x04` (`0x50 0x4B 0x03 0x04`) |
| **Plain Text / CSV** | `.txt`, `.csv` | Valid UTF-8 encoding with zero embedded NUL bytes (`0x00`) |

If the file extension does not match the inspected magic bytes, the upload is rejected immediately with `415 Unsupported Media Type` (tested by `test23_InvalidFileTypeRejection`).

### 3.3 Path Traversal Defenses
User-supplied filenames can contain directory traversal sequences. The sanitization method enforces strict hygiene:
```java
public String validateAndSanitizeFilename(String rawFilename) {
    if (rawFilename == null || rawFilename.isBlank()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Filename is required");
    }
    // Remove null bytes and control characters
    String clean = rawFilename.replaceAll("[\\x00-\\x1F\\x7F]", "");
    // Extract basename only
    int lastSep = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
    if (lastSep >= 0) {
        clean = clean.substring(lastSep + 1);
    }
    // Disallow path traversal relative elements
    if (clean.equals("..") || clean.startsWith("..") || clean.isBlank()) {
        clean = "evidence_" + System.currentTimeMillis();
    }
    // Remove Windows reserved characters
    clean = clean.replaceAll("[<>:\"/\\\\|?*]", "_");
    return clean;
}
```

### 3.4 Multi-Tenant Storage Isolation
Physical evidence files are stored using tenant-isolated directory paths and UUID identifiers:
$$\text{Storage Path} = \text{uploadDir} / \{\text{companyId}\} / \{\text{fileUUID}\}\{\text{extension}\}$$

- Files are never stored under user-supplied names on disk.
- Cross-tenant directory traversal is structurally impossible.
- Multi-tenant query isolation ensures tenant A can never retrieve, download, verify, or delete tenant B's evidence (`test25_CrossCompanyEvidenceAccess`).

### 3.5 SHA-256 Stream Hashing & On-Demand Integrity Verification
1. **Upload Stream Hashing:** During file upload, the byte stream is processed through a `MessageDigest(SHA-256)` simultaneously while writing to disk. The resulting 64-character lowercase hexadecimal hash is stored in `evidence.sha256_hash`.
2. **On-Demand Verification (`PUT /api/evidence/{id}/verify`):**
   - The server re-reads the physical file stored on disk.
   - Computes its actual SHA-256 digest.
   - Compares the actual digest against `evidence.sha256_hash`.
   - If identical, marks `is_verified = true`, sets `verified_by_user_id` and `verified_at`, and records an audit history entry.
   - If the file was tampered with or corrupted on disk, throws `409 Conflict` (tested by `test26_Sha256IntegrityVerification`).

### 3.6 Enterprise SHA-256 Lock
For regulatory compliance (e.g. SOX, SOC 2, ISO 27001), companies can enable the Enterprise SHA-Lock via `companies.sha_lock_enabled = true`.

When active:
- Once an evidence record is marked `is_verified = true`, its association with audits, findings, or classification is immutable.
- Any attempt to update metadata or re-link verified evidence triggers `400 Bad Request` (`test27_EvidenceReplacementAndRelinking`).

---

## 4. Security Verification Verdict

All security mechanisms in the Evidence Vault have been implemented, tested, and confirmed to match or exceed the Python FastAPI baseline.

**Evidence Security Status:** **PASSED — ALL DEFENSIVE CONTROLS OPERATIONAL.**
