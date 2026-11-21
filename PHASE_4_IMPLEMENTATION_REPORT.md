# Phase 4 Implementation Report: Governance, Findings, CAPA, Risks & Evidence Vault
**Platform:** CompanyAudit — Enterprise Audit & Performance Analytics Platform  
**Architecture:** Python 3.13 / FastAPI -> Java 17 LTS / Spring Boot 3.4.0  
**Phase:** Phase 4 — Governance (Findings, CAPA & Risks) & Evidence Vault  
**Status:** IMPLEMENTED & VERIFIED (33/33 Phase 4 Tests Passing; 100/100 Cumulative Tests Passing)  
**Date:** 2026-11-21  

---

## 1. Executive Summary

Phase 4 of the CompanyAudit platform migration implements the complete enterprise governance suite in Java 17 LTS and Spring Boot 3.4.0. This includes Findings Management, Recommendations, Corrective and Preventive Actions (CAPA), Enterprise Risk Management (ERM), and the Secure Evidence Vault with cryptographic SHA-256 verification.

All business workflows, validation rules, role-based authorization boundaries, and REST API contracts from the existing Python FastAPI backend (`backend/app/api/routes/governance.py`, `backend/app/api/routes/evidence.py`, `backend/app/services/evidence_storage.py`, `backend/app/services/scoring.py`) have been faithfully replicated. Database compatibility is strictly maintained under PostgreSQL 16 with Hibernate `ddl-auto=validate`. Zero schema mutations were performed.

### Phase 4 Scope & Objectives Completed:
1. **Findings Management:** Implemented `FindingEntity`, `FindingRepository`, `FindingService`, and `FindingController` supporting finding creation, SLA countdown calculation, overdue tracking, department confinement, fine-grained role permissions (DeptHead and Management restrictions), and formal sign-off closure.
2. **Recommendations Workflow:** Implemented `RecommendationEntity`, `RecommendationRepository`, and recommendation creation and management response capture endpoints (`POST /api/recommendations`, `POST /api/recommendations/{id}/respond`).
3. **Corrective & Preventive Actions (CAPA):** Implemented `CorrectiveActionEntity`, `CorrectiveActionRepository`, `CorrectiveActionService`, and `CorrectiveActionController` with step ordering, finding/risk linkages, progress percent updates, submission timestamps, and auditor verification/rejection workflows.
4. **Enterprise Risk Management (ERM):** Implemented `RiskEntity`, `RiskRepository`, `RiskService`, and `RiskController` providing inherent risk calculation ($P \times I$), 4-tier severity bands (Low, Medium, High, Critical), residual risk calculation ($P_{res} \times I_{res}$), risk escalation workflows, and management role constraints.
5. **Secure Evidence Vault:** Implemented `EvidenceEntity`, `EvidenceRepository`, `EvidenceStorageService`, `EvidenceService`, and `EvidenceController` supporting multipart uploads with 25 MB size caps, MIME/magic byte inspection, path traversal prevention, SHA-256 checksum generation, disk integrity verification, and Enterprise SHA-256 Lock protection.
6. **Audit History & Cryptographic Chaining:** Integrated all findings, actions, risks, and evidence mutations with `AuditHistoryService` using SHA-256 canonical JSON hash chaining (`AuditHashCalculator.computeEventSha256`).
7. **Automated Testing & Parity:** Implemented 33 comprehensive unit and service tests in `Phase4GovernanceAndEvidenceTest.java`. All 33 tests pass with 0 failures and 0 errors, bringing total passing tests across all phases to 100/100.

---

## 2. Implemented Architecture & Component Inventory

### 2.1 JPA Entities (`io.companyaudit.platform.domain`)
All JPA entities map directly to the existing PostgreSQL 16 schema validated via Hibernate `ddl-auto=validate`.

| Entity Class | Table Name | Purpose & Key Database Constraints |
| :--- | :--- | :--- |
| `FindingEntity` | `findings` | Audit findings. Contains `company_id`, `audit_id`, `department_id`, `owner_user_id`, `lead_auditor_id`, `signed_off_by_id`, `code`, `title`, `root_cause`, `workstream`, `severity` (Critical, High, Medium, Low), `status` (Open, In Progress, Verification Pending, Overdue, Closed), `target_sla_date`, `management_response`, `rejection_reason`, and `signed_off_at`. |
| `RecommendationEntity` | `recommendations` | Auditor recommendations on findings. Contains `company_id`, `finding_id`, `risk_id`, `author_user_id`, `title`, `guidance`, `priority`, `management_response`, `accepted_by_management`, and `accepted_at`. |
| `CorrectiveActionEntity` | `corrective_actions` | Remediation actions. Contains `company_id`, `finding_id`, `recommendation_id`, `risk_id`, `assigned_to_user_id`, `verified_by_user_id`, `code`, `step_order`, `title`, `detail`, `status` (Pending, In Progress, Submitted, Verified, Rejected), `progress_percent` (0-100), `due_date`, `completed_at`, and `verified_at`. |
| `RiskEntity` | `risks` | Enterprise risk register. Contains `company_id`, `department_id`, `owner_user_id`, `linked_audit_id`, `code`, `title`, `scope_description`, `category` (Technology, Financial, Compliance, Operations, Strategic, HR), `probability` (1-5), `impact` (1-5), `inherent_score` (1-25), `severity`, `residual_probability`, `residual_impact`, `mitigation_strategy`, `narrative`, `affected_assets` (JSONB), `mapped_frameworks` (JSONB), `escalation_target`, `next_review_date`, and `status`. |
| `EvidenceEntity` | `evidence` | Evidence artifacts. Contains `company_id`, `audit_id`, `finding_id`, `corrective_action_id`, `checklist_item_id`, `uploaded_by_user_id`, `reviewed_by_user_id`, `code`, `original_filename`, `storage_key` (unique), `mime_type`, `byte_size` (max 25MB), `sha256_hash` (64 hex), `verification_status` (Pending Review, Verified, Flagged), `tag`, and `reviewed_at`. |

### 2.2 Data Transfer Objects (`io.companyaudit.platform.dto.*`)
All DTOs serialize and deserialize using Jackson's `snake_case` naming strategy to preserve 100% JSON contract parity with the React frontend.

- **Request DTOs (`dto.request`):**
  - `FindingCreate`: Validates `title` (3-255 chars), `root_cause` (min 5 chars), `audit_id`, `department_id`, `severity`, and `target_sla_date`.
  - `FindingUpdate`: Supports partial updates, `rejection_reason` (min 3 chars), and `sign_off` boolean.
  - `RecommendationCreate`: Validates `finding_id`, `title`, `guidance`, and `priority`.
  - `RecommendationRespondRequest`: Captures `management_response` and `accepted_by_management`.
  - `CorrectiveActionCreate`: Enforces linkage to `finding_id` or `risk_id`, `step_order` ($\ge 1$), `due_date`, and `title`.
  - `CorrectiveActionUpdate`: Partial action update with `progress_percent` (0-100), status, and assignment.
  - `RiskCreate`: Enforces `probability` (1-5), `impact` (1-5), `category`, `scope_description`, and frameworks list.
  - `RiskUpdate`: Updates risk assessment with residual scores, assets, and review dates.
  - `RiskEscalateRequest`: Captures `escalation_target` and optional justification `note`.
  - `EvidenceVerifyRequest`: Captures `verification_status` and `verify_file_checksum` flag.
  - `EvidenceUpdate`: Partial metadata and linkage updates.
- **Response DTOs (`dto.response`):**
  - `FindingOut`: Comprehensive finding representation including SLA countdown string (`In X Days`, `Overdue Xd`, `Due Today`, `Pending Sign-off`, `Resolved`), `is_overdue` boolean, calculated `progress_percent`, owner/auditor names and initials, nested recommendations, corrective actions, and evidence items.
  - `RecommendationOut`: Exposes id, finding id, author details, guidance, management response, and acceptance timestamps.
  - `CorrectiveActionOut`: Exposes id, codes, titles, assigned owner name, verifier name, progress, and dates.
  - `RiskOut`: Exposes id, department name, owner details, inherent score, severity, residual score, residual level, affected assets, and mapped frameworks.
  - `EvidenceOut`: Exposes id, audit code, finding code, uploader name, reviewer name, original filename, byte size, SHA-256 hash, and verification status.
  - `AuditHistoryOut`: Ledger event DTO for tracking evidence audit history.

### 2.3 Repositories (`io.companyaudit.platform.repository`)
- `FindingRepository`: Tenant-isolated queries (`findByIdAndCompanyId`, `findByCompanyIdOrderByTargetSlaDateAsc`, `findByAuditIdAndCompanyId`, `countByAuditIdAndStatusNot`).
- `RecommendationRepository`: Finding recommendations (`findByCompanyIdAndFindingIdOrderByCreatedAtAsc`).
- `CorrectiveActionRepository`: Action listings and lookups (`findByCompanyIdOrderByDueDateAscStepOrderAsc`, `findByFindingIdIn`, `findByRiskIdIn`).
- `RiskRepository`: Risk register queries (`findByCompanyIdOrderByInherentScoreDescCodeAsc`, `findByIdAndCompanyId`).
- `EvidenceRepository`: Artifact lookups (`findByCompanyIdOrderByCreatedAtDesc`, `findByFindingIdInOrderByCreatedAtDesc`, `findByStorageKey`).

### 2.4 Service Layer (`io.companyaudit.platform.service`)
- **`EvidenceStorageService`:**
  - `storeUploadedEvidence(file, companyId)`: Validates file extension against whitelist, checks magic bytes, enforces 25 MB cap, computes SHA-256 hash, generates safe storage key `{company_id}/{uuid}{ext}`, and writes payload outside web root.
  - `resolveEvidencePath(storageKey)`: Prevents path traversal by enforcing normalized parent path boundaries.
  - `verifyStoredFileSha256(storageKey, expectedSha256)`: Reads stored artifact and verifies SHA-256 checksum against database record.
- **`FindingService`:**
  - Manages finding lifecycle, SLA countdown computation, auto-code generation (`FND-xxxx`), owner assignments, and role-based access rules.
- **`CorrectiveActionService`:**
  - Manages action execution, step ordering, progress updates, auto-code generation (`ACT-xxxx`), completion tracking, and auditor verification.
- **`RiskService`:**
  - Calculates inherent risk ($P \times I$), classifies severity bands, calculates residual risk, handles risk escalation, and enforces management role permissions.
- **`EvidenceService`:**
  - Handles evidence upload, download verification, metadata updates, Enterprise SHA-256 Lock enforcement, and audit history ledger querying.

### 2.5 REST Controllers (`io.companyaudit.platform.controller`)
- **`FindingController`:** Endpoints for `/api/findings` and `/api/recommendations` with Spring Security `@PreAuthorize` role enforcement.
- **`CorrectiveActionController`:** Endpoints for `/api/actions` with fine-grained department scope and verification permissions.
- **`RiskController`:** Endpoints for `/api/risks` and `/api/risks/{id}/escalate`.
- **`EvidenceController`:** Endpoints for `/api/evidence` (upload, download stream, verify, metadata, history).

---

## 3. Governance Workflows & Business Rules

### 3.1 Finding Lifecycle & Permissions
- **Creation:** Allowed for `Admin` and `Auditor`. Auto-generates sequential code `FND-xxxx`.
- **Department Head Restriction:** Department Heads can only submit `management_response` or update status to `Verification Pending` on findings belonging to their own department. All other fields are forbidden (`403 Forbidden`).
- **Management Role Restriction:** Management can only submit management responses, approve sign-off (`sign_off=true`, status `Closed`), or reject verification back to `In Progress` / `Open`.
- **Verification Rejection:** Rejection from `Verification Pending` to `In Progress` requires a clear `rejection_reason` of at least 3 characters (`422 Unprocessable Entity` if omitted).
- **Closure & Sign-off:** Transitions to `Closed` record the `signed_off_by_id` and timestamp `signed_off_at`, and clear any previous rejection reason.
- **Delete Protection:** Findings in `Closed` status cannot be deleted (`400 Bad Request`).

### 3.2 Corrective Action (CAPA) Workflow
- **Linkage Requirement:** An action must link to either `finding_id` or `risk_id` (`422 Unprocessable Entity` if neither provided).
- **Submission:** Marking an action `Submitted` automatically sets `completed_at` to the current timestamp and updates `progress_percent` to 100%.
- **Verification:** Only `Admin` and `Auditor` roles can mark an action `Verified` or `Rejected`. Attempt by `Department Head` throws `403 Forbidden`.
- **Verification Outcome:** Marking an action `Verified` records `verified_by_user_id`, sets `verified_at`, and locks the action from deletion (`400 Bad Request`).

### 3.3 Risk Assessment & Severity Bands
- **Inherent Risk Formula:** $\text{Inherent Score} = \text{Probability} \times \text{Impact}$ ($1 \le P \le 5$, $1 \le I \le 5$).
- **Severity Bands:**
  - $1 \le \text{Score} \le 4$: **Low**
  - $5 \le \text{Score} \le 9$: **Medium**
  - $10 \le \text{Score} \le 16$: **High**
  - $17 \le \text{Score} \le 25$: **Critical**
- **Residual Risk Formula:** $\text{Residual Score} = \text{Residual Probability} \times \text{Residual Impact}$ (falling back to probability and impact if residual values are not specified).
- **Escalation:** Escalating a risk sets `escalation_target` and advances `Open` risks to `In Review`.
- **Management Restriction:** Management users can only modify `status`, `escalation_target`, and `next_review_date`.

### 3.4 Evidence Vault & Cryptographic Chain of Custody
- **Upload Cap:** 25 MB ($26,214,400$ bytes) enforced by application limit and Spring multipart parser.
- **MIME & Magic Bytes:** Whitelisted extensions (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.csv`, `.json`, `.log`, `.txt`, `.xlsx`, `.docx`) inspected for file signatures. Executables and scripts (`.exe`, `.sh`, `.bat`, etc.) rejected with `415 Unsupported Media Type`.
- **SHA-256 Hash:** Computed from stream bytes during upload. Persisted as 64-character lowercase hex in `evidence.sha256_hash`.
- **Integrity Verification:** The verify endpoint recomputes disk checksums. Corrupted files are flagged as `Flagged` and rejected with `409 Conflict`.
- **Enterprise SHA-256 Lock:** When `companies.sha_lock_enabled` is true, verified evidence artifacts cannot be re-linked to other audits or findings (`400 Bad Request`).

---

## 4. Verification & Automated Test Summary

The Phase 4 test suite in `Phase4GovernanceAndEvidenceTest.java` was executed via Maven Wrapper:
- **Phase 4 Tests Run:** 33 tests, 0 failures, 0 errors, 0 skipped.
- **Cumulative Test Count:** 100 tests run across Phase 0 through Phase 4, 0 failures, 0 errors.
- **Total Compilation Status:** 117 Java source files compiled with 0 warnings/errors.
- **Database Safety:** PostgreSQL 16 schema validated with `ddl-auto=validate`. Zero schema mutations.
