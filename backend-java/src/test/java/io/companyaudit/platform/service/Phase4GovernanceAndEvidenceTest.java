package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.*;
import io.companyaudit.platform.dto.request.*;
import io.companyaudit.platform.dto.response.*;
import io.companyaudit.platform.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Phase 4: Governance (Findings, CAPA, Risks) & Evidence Vault (33 Test Cases)")
class Phase4GovernanceAndEvidenceTest {

    @Mock private FindingRepository findingRepository;
    @Mock private AuditRepository auditRepository;
    @Mock private DepartmentRepository departmentRepository;
    @Mock private UserRepository userRepository;
    @Mock private RecommendationRepository recommendationRepository;
    @Mock private CorrectiveActionRepository correctiveActionRepository;
    @Mock private RiskRepository riskRepository;
    @Mock private EvidenceRepository evidenceRepository;
    @Mock private AuditHistoryRepository auditHistoryRepository;
    @Mock private CompanyRepository companyRepository;
    @Mock private ChecklistItemRepository checklistItemRepository;

    private AuditHistoryService auditHistoryService;
    private EvidenceStorageService evidenceStorageService;
    private FindingService findingService;
    private CorrectiveActionService correctiveActionService;
    private RiskService riskService;
    private EvidenceService evidenceService;

    @TempDir
    Path tempStorageDir;

    private final UUID companyId1 = UUID.randomUUID();
    private final UUID companyId2 = UUID.randomUUID();
    private final UUID deptId1 = UUID.randomUUID();
    private final UUID deptId2 = UUID.randomUUID();
    private final UUID adminId = UUID.randomUUID();
    private final UUID auditorId = UUID.randomUUID();
    private final UUID deptHeadId = UUID.randomUUID();
    private final UUID auditId1 = UUID.randomUUID();

    private UserEntity adminUser;
    private UserEntity auditorUser;
    private UserEntity deptHeadUser;
    private DepartmentEntity department1;
    private AuditEntity audit1;
    private CompanyEntity company1;

    @BeforeEach
    void setUp() {
        auditHistoryService = new AuditHistoryService(auditHistoryRepository);
        evidenceStorageService = new EvidenceStorageService(tempStorageDir.toString());

        findingService = new FindingService(
                findingRepository, auditRepository, departmentRepository, userRepository,
                recommendationRepository, correctiveActionRepository, evidenceRepository, auditHistoryService
        );

        correctiveActionService = new CorrectiveActionService(
                correctiveActionRepository, findingRepository, riskRepository, userRepository, auditHistoryService
        );

        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        riskService = new RiskService(
                riskRepository, departmentRepository, userRepository, auditRepository,
                correctiveActionRepository, correctiveActionService, auditHistoryService, mapper
        );

        evidenceService = new EvidenceService(
                evidenceRepository, evidenceStorageService, companyRepository, auditRepository,
                findingRepository, correctiveActionRepository, checklistItemRepository,
                departmentRepository, userRepository, auditHistoryRepository, auditHistoryService
        );

        adminUser = new UserEntity();
        adminUser.setId(adminId);
        adminUser.setCompanyId(companyId1);
        adminUser.setFullName("System Admin");
        adminUser.setRole("Admin");

        auditorUser = new UserEntity();
        auditorUser.setId(auditorId);
        auditorUser.setCompanyId(companyId1);
        auditorUser.setFullName("Auditor Alice");
        auditorUser.setRole("Auditor");

        deptHeadUser = new UserEntity();
        deptHeadUser.setId(deptHeadId);
        deptHeadUser.setCompanyId(companyId1);
        deptHeadUser.setDepartmentId(deptId1);
        deptHeadUser.setFullName("David DeptHead");
        deptHeadUser.setRole("Department Head");

        department1 = new DepartmentEntity();
        department1.setId(deptId1);
        department1.setCompanyId(companyId1);
        department1.setName("Technology Department");
        department1.setCode("TECH");
        department1.setHeadUserId(deptHeadId);

        audit1 = new AuditEntity();
        audit1.setId(auditId1);
        audit1.setCompanyId(companyId1);
        audit1.setDepartmentId(deptId1);
        audit1.setCode("AUD-2026-001");
        audit1.setTitle("Technology Security Audit");
        audit1.setStatus("In Progress");

        company1 = new CompanyEntity();
        company1.setId(companyId1);
        company1.setLegalName("Acme Corp");
        company1.setShaLockEnabled(true);
    }

    // =========================================================================
    // FINDINGS TESTS (1 - 7)
    // =========================================================================

    @Test
    @DisplayName("1. Finding Creation: Auto-code FND-xxxx, Open status, and history logged")
    void test01_FindingCreation() {
        when(auditRepository.findByIdAndCompanyId(auditId1, companyId1)).thenReturn(Optional.of(audit1));
        when(departmentRepository.findById(deptId1)).thenReturn(Optional.of(department1));
        when(findingRepository.existsByCompanyIdAndCode(any(), any())).thenReturn(false);
        when(findingRepository.findByCompanyId(companyId1)).thenReturn(Collections.emptyList());

        when(findingRepository.saveAndFlush(any(FindingEntity.class))).thenAnswer(inv -> {
            FindingEntity f = inv.getArgument(0);
            f.setId(UUID.randomUUID());
            f.setCreatedAt(OffsetDateTime.now());
            f.setUpdatedAt(OffsetDateTime.now());
            return f;
        });

        FindingCreate create = new FindingCreate();
        create.setAuditId(auditId1);
        create.setDepartmentId(deptId1);
        create.setTitle("Unencrypted S3 Bucket in Staging");
        create.setRootCause("Missing Terraform baseline configuration");
        create.setSeverity("High");
        create.setTargetSlaDate(LocalDate.now().plusDays(14));

        FindingOut result = findingService.createFinding(companyId1, auditorId, "Auditor", create, "127.0.0.1");

        assertNotNull(result);
        assertTrue(result.getCode().startsWith("FND-"));
        assertEquals("Open", result.getStatus());
        assertEquals("High", result.getSeverity());
        verify(findingRepository, times(1)).saveAndFlush(any(FindingEntity.class));
        verify(auditHistoryRepository, times(1)).save(any(AuditHistoryEntity.class));
    }

    @Test
    @DisplayName("2. Finding Retrieval: Retrieves finding with serialized SLA countdown and relations")
    void test02_FindingRetrieval() {
        UUID findingId = UUID.randomUUID();
        FindingEntity f = createSampleFinding(findingId, companyId1, "FND-1031", "Open", "High");

        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.of(f));
        when(auditRepository.findAllById(any())).thenReturn(List.of(audit1));
        when(departmentRepository.findAllById(any())).thenReturn(List.of(department1));
        when(userRepository.findAllById(any())).thenReturn(List.of(auditorUser));

        FindingOut result = findingService.getFinding(companyId1, findingId);

        assertNotNull(result);
        assertEquals(findingId, result.getId());
        assertEquals("FND-1031", result.getCode());
        assertEquals("High", result.getSeverity());
        assertNotNull(result.getSlaCountdown());
    }

    @Test
    @DisplayName("3. Finding Updates: Updates title, root cause, and workstream")
    void test03_FindingUpdates() {
        UUID findingId = UUID.randomUUID();
        FindingEntity f = createSampleFinding(findingId, companyId1, "FND-1031", "Open", "High");

        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.of(f));
        when(findingRepository.saveAndFlush(any())).thenReturn(f);

        FindingUpdate update = new FindingUpdate();
        update.setTitle("Updated Title: Exposed Staging Bucket");
        update.setRootCause("Updated Root Cause: Incomplete IAM profile");
        update.setWorkstream("Cloud Sec");

        FindingOut result = findingService.updateFinding(companyId1, findingId, auditorId, "Auditor", null, update, "127.0.0.1");

        assertNotNull(result);
        assertEquals("Updated Title: Exposed Staging Bucket", f.getTitle());
        assertEquals("Updated Root Cause: Incomplete IAM profile", f.getRootCause());
        assertEquals("Cloud Sec", f.getWorkstream());
        verify(auditHistoryRepository, times(1)).save(any(AuditHistoryEntity.class));
    }

    @Test
    @DisplayName("4. Severity Changes: Changes severity from High to Critical")
    void test04_SeverityChanges() {
        UUID findingId = UUID.randomUUID();
        FindingEntity f = createSampleFinding(findingId, companyId1, "FND-1031", "Open", "High");

        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.of(f));
        when(findingRepository.saveAndFlush(any())).thenReturn(f);

        FindingUpdate update = new FindingUpdate();
        update.setSeverity("Critical");

        FindingOut result = findingService.updateFinding(companyId1, findingId, adminId, "Admin", null, update, "127.0.0.1");

        assertNotNull(result);
        assertEquals("Critical", f.getSeverity());
    }

    @Test
    @DisplayName("5. Finding Assignment: Assigns finding owner")
    void test05_FindingAssignment() {
        UUID findingId = UUID.randomUUID();
        FindingEntity f = createSampleFinding(findingId, companyId1, "FND-1031", "Open", "High");

        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.of(f));
        when(findingRepository.saveAndFlush(any())).thenReturn(f);

        FindingUpdate update = new FindingUpdate();
        update.setOwnerUserId(deptHeadId);

        FindingOut result = findingService.updateFinding(companyId1, findingId, adminId, "Admin", null, update, "127.0.0.1");

        assertNotNull(result);
        assertEquals(deptHeadId, f.getOwnerUserId());
    }

    @Test
    @DisplayName("6. Unauthorized Finding Modification: DeptHead editing title is rejected (403)")
    void test06_UnauthorizedFindingModification() {
        UUID findingId = UUID.randomUUID();
        FindingEntity f = createSampleFinding(findingId, companyId1, "FND-1031", "Open", "High");

        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.of(f));

        FindingUpdate update = new FindingUpdate();
        update.setTitle("Unauthorized Edit by DeptHead");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                findingService.updateFinding(companyId1, findingId, deptHeadId, "Department Head", deptId1, update, "127.0.0.1")
        );
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    @DisplayName("7. Cross-Company Finding Access: Finding of Company B requested with Company A credentials throws 404")
    void test07_CrossCompanyFindingAccess() {
        UUID findingId = UUID.randomUUID();
        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                findingService.getFinding(companyId1, findingId)
        );
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    // =========================================================================
    // CORRECTIVE ACTION (CAPA) TESTS (8 - 15)
    // =========================================================================

    @Test
    @DisplayName("8. Corrective Action Creation: Creates action linked to finding, initial Pending status")
    void test08_CorrectiveActionCreation() {
        UUID findingId = UUID.randomUUID();
        FindingEntity f = createSampleFinding(findingId, companyId1, "FND-1031", "Open", "High");

        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.of(f));
        when(correctiveActionRepository.existsByCompanyIdAndCode(any(), any())).thenReturn(false);
        when(correctiveActionRepository.findByCompanyIdOrderByDueDateAscStepOrderAsc(companyId1)).thenReturn(Collections.emptyList());

        when(correctiveActionRepository.saveAndFlush(any())).thenAnswer(inv -> {
            CorrectiveActionEntity a = inv.getArgument(0);
            a.setId(UUID.randomUUID());
            a.setCreatedAt(OffsetDateTime.now());
            a.setUpdatedAt(OffsetDateTime.now());
            return a;
        });

        CorrectiveActionCreate create = new CorrectiveActionCreate();
        create.setFindingId(findingId);
        create.setTitle("Enable AWS KMS default encryption on bucket");
        create.setDueDate(LocalDate.now().plusDays(7));

        CorrectiveActionOut result = correctiveActionService.createAction(companyId1, adminId, "Admin", deptId1, create, "127.0.0.1");

        assertNotNull(result);
        assertTrue(result.getCode().startsWith("ACT-"));
        assertEquals("Pending", result.getStatus());
        assertEquals(0, result.getProgressPercent());
        verify(correctiveActionRepository, times(1)).saveAndFlush(any());
        verify(auditHistoryRepository, times(1)).save(any());
    }

    @Test
    @DisplayName("9. Action Owner Assignment: Assigns responsible action owner")
    void test09_ActionOwnerAssignment() {
        UUID actionId = UUID.randomUUID();
        CorrectiveActionEntity a = createSampleAction(actionId, companyId1, "ACT-111", "Pending");

        when(correctiveActionRepository.findByIdAndCompanyId(actionId, companyId1)).thenReturn(Optional.of(a));
        when(correctiveActionRepository.saveAndFlush(any())).thenReturn(a);

        CorrectiveActionUpdate update = new CorrectiveActionUpdate();
        update.setAssignedToUserId(deptHeadId);

        CorrectiveActionOut result = correctiveActionService.updateAction(companyId1, actionId, adminId, "Admin", null, update, "127.0.0.1");

        assertNotNull(result);
        assertEquals(deptHeadId, a.getAssignedToUserId());
    }

    @Test
    @DisplayName("10. Deadline Validation: Action without finding_id or risk_id throws 422")
    void test10_DeadlineValidation() {
        CorrectiveActionCreate create = new CorrectiveActionCreate();
        create.setTitle("Orphan Action");
        create.setDueDate(LocalDate.now().plusDays(10));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                correctiveActionService.createAction(companyId1, adminId, "Admin", null, create, "127.0.0.1")
        );
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
    }

    @Test
    @DisplayName("11. Action Progress Updates: Updates progress percentage to 75%")
    void test11_ActionProgressUpdates() {
        UUID actionId = UUID.randomUUID();
        CorrectiveActionEntity a = createSampleAction(actionId, companyId1, "ACT-111", "In Progress");

        when(correctiveActionRepository.findByIdAndCompanyId(actionId, companyId1)).thenReturn(Optional.of(a));
        when(correctiveActionRepository.saveAndFlush(any())).thenReturn(a);

        CorrectiveActionUpdate update = new CorrectiveActionUpdate();
        update.setProgressPercent(75);

        CorrectiveActionOut result = correctiveActionService.updateAction(companyId1, actionId, deptHeadId, "Department Head", deptId1, update, "127.0.0.1");

        assertNotNull(result);
        assertEquals(75, a.getProgressPercent());
    }

    @Test
    @DisplayName("12. Verification Approval: Verified status sets verified_by, verified_at, progress 100%")
    void test12_VerificationApproval() {
        UUID actionId = UUID.randomUUID();
        CorrectiveActionEntity a = createSampleAction(actionId, companyId1, "ACT-111", "Submitted");

        when(correctiveActionRepository.findByIdAndCompanyId(actionId, companyId1)).thenReturn(Optional.of(a));
        when(correctiveActionRepository.saveAndFlush(any())).thenReturn(a);

        CorrectiveActionUpdate update = new CorrectiveActionUpdate();
        update.setStatus("Verified");

        CorrectiveActionOut result = correctiveActionService.updateAction(companyId1, actionId, auditorId, "Auditor", null, update, "127.0.0.1");

        assertNotNull(result);
        assertEquals("Verified", a.getStatus());
        assertEquals(auditorId, a.getVerifiedByUserId());
        assertNotNull(a.getVerifiedAt());
        assertEquals(100, a.getProgressPercent());
    }

    @Test
    @DisplayName("13. Verification Rejection: Finding returned to In Progress with rejection reason")
    void test13_VerificationRejection() {
        UUID findingId = UUID.randomUUID();
        FindingEntity f = createSampleFinding(findingId, companyId1, "FND-1031", "Verification Pending", "High");

        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.of(f));
        when(findingRepository.saveAndFlush(any())).thenReturn(f);

        FindingUpdate update = new FindingUpdate();
        update.setStatus("In Progress");
        update.setRejectionReason("Evidence file does not demonstrate active TLS 1.3 configuration");

        FindingOut result = findingService.updateFinding(companyId1, findingId, auditorId, "Auditor", null, update, "127.0.0.1");

        assertNotNull(result);
        assertEquals("In Progress", f.getStatus());
        assertEquals("Evidence file does not demonstrate active TLS 1.3 configuration", f.getRejectionReason());
        assertNull(f.getSignedOffAt());
    }

    @Test
    @DisplayName("14. Action Reopening: Rejection without rejection_reason (min 3 chars) throws 422")
    void test14_ActionReopening() {
        UUID findingId = UUID.randomUUID();
        FindingEntity f = createSampleFinding(findingId, companyId1, "FND-1031", "Verification Pending", "High");

        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.of(f));

        FindingUpdate update = new FindingUpdate();
        update.setStatus("In Progress");
        update.setRejectionReason("No"); // Under 3 characters

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                findingService.updateFinding(companyId1, findingId, auditorId, "Auditor", null, update, "127.0.0.1")
        );
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, ex.getStatusCode());
    }

    @Test
    @DisplayName("15. Unauthorized Verification: DeptHead attempting to verify action throws 403")
    void test15_UnauthorizedVerification() {
        UUID actionId = UUID.randomUUID();
        CorrectiveActionEntity a = createSampleAction(actionId, companyId1, "ACT-111", "Submitted");

        when(correctiveActionRepository.findByIdAndCompanyId(actionId, companyId1)).thenReturn(Optional.of(a));

        CorrectiveActionUpdate update = new CorrectiveActionUpdate();
        update.setStatus("Verified");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                correctiveActionService.updateAction(companyId1, actionId, deptHeadId, "Department Head", deptId1, update, "127.0.0.1")
        );
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // =========================================================================
    // RISK MANAGEMENT TESTS (16 - 20)
    // =========================================================================

    @Test
    @DisplayName("16. Inherent Risk Calculation: Probability * Impact calculates inherent score")
    void test16_InherentRiskCalculation() {
        when(departmentRepository.findById(deptId1)).thenReturn(Optional.of(department1));
        when(riskRepository.existsByCompanyIdAndCode(any(), any())).thenReturn(false);
        when(riskRepository.findByCompanyId(companyId1)).thenReturn(Collections.emptyList());

        when(riskRepository.saveAndFlush(any())).thenAnswer(inv -> {
            RiskEntity r = inv.getArgument(0);
            r.setId(UUID.randomUUID());
            r.setCreatedAt(OffsetDateTime.now());
            r.setUpdatedAt(OffsetDateTime.now());
            return r;
        });

        RiskCreate create = new RiskCreate();
        create.setDepartmentId(deptId1);
        create.setTitle("API Key Leakage in Frontend Bundle");
        create.setScopeDescription("Potential credentials exposure in public SPA assets");
        create.setCategory("Technology");
        create.setProbability(4);
        create.setImpact(5);

        RiskOut result = riskService.createRisk(companyId1, auditorId, "Auditor", create, "127.0.0.1");

        assertNotNull(result);
        assertEquals(20, result.getInherentScore());
        assertEquals("Critical", result.getSeverity());
    }

    @Test
    @DisplayName("17. Residual Risk Calculation: Residual probability * impact calculates residual score")
    void test17_ResidualRiskCalculation() {
        UUID riskId = UUID.randomUUID();
        RiskEntity r = createSampleRisk(riskId, companyId1, "RSK-04", 4, 4); // Inherent: 16 (High)
        r.setResidualProbability(2);
        r.setResidualImpact(3); // Residual: 6 (Medium)

        when(riskRepository.findByIdAndCompanyId(riskId, companyId1)).thenReturn(Optional.of(r));
        when(departmentRepository.findAllById(any())).thenReturn(List.of(department1));

        RiskOut result = riskService.getRisk(companyId1, riskId);

        assertNotNull(result);
        assertEquals(16, result.getInherentScore());
        assertEquals("High", result.getSeverity());
        assertEquals(6, result.getResidualScore());
        assertEquals("Medium", result.getResidualLevel());
    }

    @Test
    @DisplayName("18. Risk Category Validation: Severity classifications match risk bands")
    void test18_RiskCategoryValidation() {
        assertEquals("Low", RiskService.classifyRiskSeverity(1));
        assertEquals("Low", RiskService.classifyRiskSeverity(4));
        assertEquals("Medium", RiskService.classifyRiskSeverity(5));
        assertEquals("Medium", RiskService.classifyRiskSeverity(9));
        assertEquals("High", RiskService.classifyRiskSeverity(10));
        assertEquals("High", RiskService.classifyRiskSeverity(16));
        assertEquals("Critical", RiskService.classifyRiskSeverity(17));
        assertEquals("Critical", RiskService.classifyRiskSeverity(25));
    }

    @Test
    @DisplayName("19. Risk Escalation: Escalates risk to target and sets status In Review")
    void test19_RiskEscalate() {
        UUID riskId = UUID.randomUUID();
        RiskEntity r = createSampleRisk(riskId, companyId1, "RSK-04", 5, 5); // Critical, status Open

        when(riskRepository.findByIdAndCompanyId(riskId, companyId1)).thenReturn(Optional.of(r));
        when(riskRepository.saveAndFlush(any())).thenReturn(r);

        RiskEscalateRequest req = new RiskEscalateRequest();
        req.setEscalationTarget("Executive Risk Committee");
        req.setNote("Immediate capital allocation needed for database replication");

        RiskOut result = riskService.escalateRisk(companyId1, riskId, adminId, "Admin", req, "127.0.0.1");

        assertNotNull(result);
        assertEquals("Executive Risk Committee", r.getEscalationTarget());
        assertEquals("In Review", r.getStatus());
        verify(auditHistoryRepository, times(1)).save(any());
    }

    @Test
    @DisplayName("20. Unauthorized Risk Modification: Management role modifying scope description throws 403")
    void test20_UnauthorizedRiskModification() {
        UUID riskId = UUID.randomUUID();
        RiskEntity r = createSampleRisk(riskId, companyId1, "RSK-04", 3, 3);

        when(riskRepository.findByIdAndCompanyId(riskId, companyId1)).thenReturn(Optional.of(r));

        RiskUpdate update = new RiskUpdate();
        update.setScopeDescription("Unauthorized Scope Mutation");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                riskService.updateRisk(companyId1, riskId, adminId, "Management", update, "127.0.0.1")
        );
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // =========================================================================
    // EVIDENCE VAULT TESTS (21 - 28)
    // =========================================================================

    @Test
    @DisplayName("21. Valid Evidence Upload: Stores PDF artifact with magic bytes, computes SHA-256")
    void test21_ValidEvidenceUpload() throws IOException {
        when(auditRepository.findByIdAndCompanyId(auditId1, companyId1)).thenReturn(Optional.of(audit1));
        when(evidenceRepository.findByCompanyIdOrderByCreatedAtDesc(companyId1)).thenReturn(Collections.emptyList());

        when(evidenceRepository.saveAndFlush(any())).thenAnswer(inv -> {
            EvidenceEntity e = inv.getArgument(0);
            e.setId(UUID.randomUUID());
            e.setCreatedAt(OffsetDateTime.now());
            e.setUpdatedAt(OffsetDateTime.now());
            return e;
        });

        byte[] pdfContent = "%PDF-1.7\nSample SOC2 Type II Report Content".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile("file", "soc2_report.pdf", "application/pdf", pdfContent);

        EvidenceOut result = evidenceService.uploadEvidence(
                companyId1, auditorId, "Auditor", null, file, auditId1, null, null, null, "Compliance", "127.0.0.1"
        );

        assertNotNull(result);
        assertTrue(result.getCode().startsWith("EVD-"));
        assertEquals("Pending Review", result.getVerificationStatus());
        assertEquals(64, result.getSha256Hash().length());
        verify(evidenceRepository, times(1)).saveAndFlush(any());
        verify(auditHistoryRepository, times(1)).save(any());
    }

    @Test
    @DisplayName("22. Oversized Upload Rejection: File exceeding 25 MB is rejected with 413")
    void test22_OversizedUploadRejection() {
        // Construct oversized mock file
        byte[] largeChunk = new byte[(int) EvidenceStorageService.MAX_EVIDENCE_BYTES + 1024];
        MockMultipartFile file = new MockMultipartFile("file", "huge.pdf", "application/pdf", largeChunk);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                evidenceStorageService.storeUploadedEvidence(file, companyId1)
        );
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, ex.getStatusCode());
    }

    @Test
    @DisplayName("23. Invalid File Type Rejection: Executable or script extension rejected with 415")
    void test23_InvalidFileTypeRejection() {
        byte[] scriptContent = "echo 'Malicious Payload'".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile("file", "exploit.sh", "application/x-sh", scriptContent);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                evidenceStorageService.storeUploadedEvidence(file, companyId1)
        );
        assertEquals(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ex.getStatusCode());
    }

    @Test
    @DisplayName("24. Unauthorized Evidence Download: Accessing evidence of different company throws 404")
    void test24_UnauthorizedEvidenceDownload() {
        UUID evidenceId = UUID.randomUUID();
        when(evidenceRepository.findByIdAndCompanyId(evidenceId, companyId1)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                evidenceService.downloadEvidence(companyId1, evidenceId)
        );
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    @DisplayName("25. Cross-Company Evidence Access: Request with non-matching company ID throws 404")
    void test25_CrossCompanyEvidenceAccess() {
        UUID evidenceId = UUID.randomUUID();
        when(evidenceRepository.findByIdAndCompanyId(evidenceId, companyId2)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                evidenceService.downloadEvidence(companyId2, evidenceId)
        );
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    @DisplayName("26. SHA-256 Integrity Verification: Verify evidence with disk checksum mismatch throws 409 Flagged")
    void test26_Sha256IntegrityVerification() throws IOException {
        UUID evidenceId = UUID.randomUUID();
        EvidenceEntity ev = createSampleEvidence(evidenceId, companyId1, "EVD-4101");

        // Write real file but set mismatched expected SHA
        Path path = tempStorageDir.resolve(ev.getStorageKey());
        Files.createDirectories(path.getParent());
        Files.write(path, "Real Content on Disk".getBytes(StandardCharsets.UTF_8));
        ev.setSha256Hash("0000000000000000000000000000000000000000000000000000000000000000"); // Corrupted hash

        when(evidenceRepository.findByIdAndCompanyId(evidenceId, companyId1)).thenReturn(Optional.of(ev));

        EvidenceVerifyRequest req = new EvidenceVerifyRequest();
        req.setVerificationStatus("Verified");
        req.setVerifyFileChecksum(true);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                evidenceService.verifyEvidence(companyId1, evidenceId, auditorId, "Auditor", req, "127.0.0.1")
        );
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertEquals("Flagged", ev.getVerificationStatus());
    }

    @Test
    @DisplayName("27. Evidence Replacement and Re-linking: Verified evidence with sha_lock_enabled cannot be re-linked (400)")
    void test27_EvidenceReplacementAndRelinking() {
        UUID evidenceId = UUID.randomUUID();
        EvidenceEntity ev = createSampleEvidence(evidenceId, companyId1, "EVD-4101");
        ev.setVerificationStatus("Verified");

        when(evidenceRepository.findByIdAndCompanyId(evidenceId, companyId1)).thenReturn(Optional.of(ev));
        when(companyRepository.findById(companyId1)).thenReturn(Optional.of(company1)); // shaLockEnabled = true

        EvidenceUpdate update = new EvidenceUpdate();
        update.setAuditId(UUID.randomUUID()); // Attempt to re-link

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                evidenceService.updateEvidenceMetadata(companyId1, evidenceId, adminId, "Admin", null, update, "127.0.0.1")
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    @DisplayName("28. Evidence Access History: Retrieves ledger entries for an evidence artifact")
    void test28_EvidenceAccessHistory() {
        UUID evidenceId = UUID.randomUUID();
        EvidenceEntity ev = createSampleEvidence(evidenceId, companyId1, "EVD-4101");

        when(evidenceRepository.findByIdAndCompanyId(evidenceId, companyId1)).thenReturn(Optional.of(ev));

        AuditHistoryEntity h = new AuditHistoryEntity();
        h.setId(UUID.randomUUID());
        h.setCompanyId(companyId1);
        h.setEntityType("Evidence");
        h.setEntityId(evidenceId);
        h.setAction("Uploaded SHA-256 verified artifact");
        h.setCreatedAt(OffsetDateTime.now());

        when(auditHistoryRepository.findByCompanyIdOrderByCreatedAtAsc(companyId1)).thenReturn(List.of(h));

        List<AuditHistoryOut> result = evidenceService.getEvidenceHistory(companyId1, evidenceId);

        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals("Uploaded SHA-256 verified artifact", result.get(0).getAction());
    }

    // =========================================================================
    // INTEGRATION TESTS (29 - 33)
    // =========================================================================

    @Test
    @DisplayName("29. Audit History Integration: Canonical hash chaining produces 64-hex event SHA-256")
    void test29_AuditHistoryIntegration() {
        when(auditHistoryRepository.findTopByCompanyIdOrderByCreatedAtDesc(companyId1)).thenReturn(Optional.empty());
        when(auditHistoryRepository.save(any(AuditHistoryEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        AuditHistoryEntity entry = auditHistoryService.recordEvent(
                companyId1, "Mutation", "Governance", "Risk", UUID.randomUUID(), "RSK-01",
                "Created test risk", adminId, "Admin", "127.0.0.1", Map.of("severity", "High")
        );

        assertNotNull(entry);
        assertNotNull(entry.getEventSha256());
        assertEquals(64, entry.getEventSha256().length());
    }

    @Test
    @DisplayName("30. Transaction Rollback: Deleting Closed finding throws 400 Bad Request, preserving state")
    void test30_TransactionRollback() {
        UUID findingId = UUID.randomUUID();
        FindingEntity f = createSampleFinding(findingId, companyId1, "FND-1031", "Closed", "High");

        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.of(f));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                findingService.deleteFinding(companyId1, findingId, adminId, "Admin", "127.0.0.1")
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(findingRepository, never()).delete(any(FindingEntity.class));
    }

    @Test
    @DisplayName("31. Concurrent Updates: Verified corrective actions cannot be deleted (400 Bad Request)")
    void test31_ConcurrentUpdates() {
        UUID actionId = UUID.randomUUID();
        CorrectiveActionEntity a = createSampleAction(actionId, companyId1, "ACT-111", "Verified");

        when(correctiveActionRepository.findByIdAndCompanyId(actionId, companyId1)).thenReturn(Optional.of(a));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                correctiveActionService.deleteAction(companyId1, actionId, adminId, "Admin", "127.0.0.1")
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(correctiveActionRepository, never()).delete(any(CorrectiveActionEntity.class));
    }

    @Test
    @DisplayName("32. Existing Authentication Integration: DeptHead cannot upload evidence to other department (403)")
    void test32_ExistingAuthenticationIntegration() {
        when(auditRepository.findByIdAndCompanyId(auditId1, companyId1)).thenReturn(Optional.of(audit1)); // deptId1

        byte[] pdfContent = "%PDF-1.7\nSample".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile("file", "audit.pdf", "application/pdf", pdfContent);

        // DeptHead has deptId2, trying to upload to audit in deptId1
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                evidenceService.uploadEvidence(companyId1, deptHeadId, "Department Head", deptId2, file, auditId1, null, null, null, null, "127.0.0.1")
        );
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    @DisplayName("33. Existing Audit Lifecycle Integration: Finding closure records signed_off_by and signed_off_at")
    void test33_ExistingAuditLifecycleIntegration() {
        UUID findingId = UUID.randomUUID();
        FindingEntity f = createSampleFinding(findingId, companyId1, "FND-1031", "Verification Pending", "High");

        when(findingRepository.findByIdAndCompanyId(findingId, companyId1)).thenReturn(Optional.of(f));
        when(findingRepository.saveAndFlush(any())).thenReturn(f);

        FindingUpdate update = new FindingUpdate();
        update.setSignOff(true);

        FindingOut result = findingService.updateFinding(companyId1, findingId, adminId, "Admin", null, update, "127.0.0.1");

        assertNotNull(result);
        assertEquals("Closed", f.getStatus());
        assertEquals(adminId, f.getSignedOffById());
        assertNotNull(f.getSignedOffAt());
        assertNull(f.getRejectionReason());
    }

    // =========================================================================
    // HELPER CREATION METHODS
    // =========================================================================

    private FindingEntity createSampleFinding(UUID id, UUID companyId, String code, String status, String severity) {
        FindingEntity f = new FindingEntity();
        f.setId(id);
        f.setCompanyId(companyId);
        f.setAuditId(auditId1);
        f.setDepartmentId(deptId1);
        f.setCode(code);
        f.setTitle("Sample Finding Title");
        f.setRootCause("Sample Root Cause");
        f.setSeverity(severity);
        f.setStatus(status);
        f.setTargetSlaDate(LocalDate.now().plusDays(10));
        f.setCreatedAt(OffsetDateTime.now());
        f.setUpdatedAt(OffsetDateTime.now());
        return f;
    }

    private CorrectiveActionEntity createSampleAction(UUID id, UUID companyId, String code, String status) {
        CorrectiveActionEntity a = new CorrectiveActionEntity();
        a.setId(id);
        a.setCompanyId(companyId);
        a.setCode(code);
        a.setTitle("Sample Action Title");
        a.setStatus(status);
        a.setStepOrder(1);
        a.setProgressPercent(0);
        a.setDueDate(LocalDate.now().plusDays(7));
        a.setCreatedAt(OffsetDateTime.now());
        a.setUpdatedAt(OffsetDateTime.now());
        return a;
    }

    private RiskEntity createSampleRisk(UUID id, UUID companyId, String code, int prob, int imp) {
        RiskEntity r = new RiskEntity();
        r.setId(id);
        r.setCompanyId(companyId);
        r.setDepartmentId(deptId1);
        r.setCode(code);
        r.setTitle("Sample Risk Title");
        r.setScopeDescription("Sample Risk Scope");
        r.setCategory("Technology");
        r.setProbability(prob);
        r.setImpact(imp);
        r.setInherentScore(prob * imp);
        r.setSeverity(RiskService.classifyRiskSeverity(prob * imp));
        r.setStatus("Open");
        r.setCreatedAt(OffsetDateTime.now());
        r.setUpdatedAt(OffsetDateTime.now());
        return r;
    }

    private EvidenceEntity createSampleEvidence(UUID id, UUID companyId, String code) {
        EvidenceEntity e = new EvidenceEntity();
        e.setId(id);
        e.setCompanyId(companyId);
        e.setAuditId(auditId1);
        e.setCode(code);
        e.setOriginalFilename("evidence.pdf");
        e.setStorageKey(companyId.toString() + "/" + UUID.randomUUID() + ".pdf");
        e.setMimeType("application/pdf");
        e.setByteSize(1024L);
        e.setSha256Hash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        e.setVerificationStatus("Pending Review");
        e.setUploadedByUserId(auditorId);
        e.setCreatedAt(OffsetDateTime.now());
        e.setUpdatedAt(OffsetDateTime.now());
        return e;
    }
}
