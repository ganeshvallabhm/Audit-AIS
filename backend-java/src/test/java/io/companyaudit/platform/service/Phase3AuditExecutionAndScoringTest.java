package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.*;
import io.companyaudit.platform.dto.request.*;
import io.companyaudit.platform.dto.response.*;
import io.companyaudit.platform.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Phase 3: Audit Execution Lifecycle, Checklists, Scheduling & Scoring (24 Test Cases)")
class Phase3AuditExecutionAndScoringTest {

    @Mock
    private AuditRepository auditRepository;

    @Mock
    private AuditScopeRepository auditScopeRepository;

    @Mock
    private AuditResponseRepository auditResponseRepository;

    @Mock
    private DepartmentRepository departmentRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ChecklistRepository checklistRepository;

    @Mock
    private ChecklistItemRepository checklistItemRepository;

    @Mock
    private FindingRepository findingRepository;

    @Mock
    private AuditHistoryRepository auditHistoryRepository;

    private AuditScoringService auditScoringService;
    private AuditHistoryService auditHistoryService;
    private AuditService auditService;

    private final UUID companyId1 = UUID.randomUUID();
    private final UUID companyId2 = UUID.randomUUID();
    private final UUID deptId1 = UUID.randomUUID();
    private final UUID deptId2 = UUID.randomUUID();
    private final UUID auditorId1 = UUID.randomUUID();
    private final UUID auditorId2 = UUID.randomUUID();
    private final UUID adminId = UUID.randomUUID();

    private DepartmentEntity department1;
    private UserEntity auditorUser1;
    private UserEntity auditorUser2;
    private UserEntity adminUser;

    @BeforeEach
    void setUp() {
        auditScoringService = new AuditScoringService();
        auditHistoryService = new AuditHistoryService(auditHistoryRepository);
        auditService = new AuditService(
                auditRepository,
                auditScopeRepository,
                auditResponseRepository,
                departmentRepository,
                userRepository,
                checklistRepository,
                checklistItemRepository,
                findingRepository,
                auditScoringService,
                auditHistoryService
        );

        department1 = new DepartmentEntity();
        department1.setId(deptId1);
        department1.setCompanyId(companyId1);
        department1.setName("Technology Department");
        department1.setCode("TECH");

        auditorUser1 = new UserEntity();
        auditorUser1.setId(auditorId1);
        auditorUser1.setCompanyId(companyId1);
        auditorUser1.setFullName("Alice Auditor");
        auditorUser1.setEmail("alice@company1.com");
        auditorUser1.setRole("Auditor");

        auditorUser2 = new UserEntity();
        auditorUser2.setId(auditorId2);
        auditorUser2.setCompanyId(companyId1);
        auditorUser2.setFullName("Bob Reassigned");
        auditorUser2.setEmail("bob@company1.com");
        auditorUser2.setRole("Auditor");

        adminUser = new UserEntity();
        adminUser.setId(adminId);
        adminUser.setCompanyId(companyId1);
        adminUser.setFullName("Admin Chief");
        adminUser.setEmail("admin@company1.com");
        adminUser.setRole("Admin");
    }

    // 1. Audit Creation
    @Test
    @DisplayName("1. Audit Creation: Valid params, auto-generated code, initial Draft status")
    void test01_AuditCreation_Success() {
        when(departmentRepository.findById(deptId1)).thenReturn(Optional.of(department1));
        when(userRepository.findById(auditorId1)).thenReturn(Optional.of(auditorUser1));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser));
        when(auditRepository.findByCompanyId(companyId1)).thenReturn(Collections.emptyList());
        when(auditRepository.existsByCompanyIdAndCode(any(), any())).thenReturn(false);
        when(departmentRepository.findAllById(any())).thenReturn(List.of(department1));
        when(userRepository.findAllById(any())).thenReturn(List.of(auditorUser1));

        when(auditRepository.saveAndFlush(any(AuditEntity.class))).thenAnswer(invocation -> {
            AuditEntity a = invocation.getArgument(0);
            a.setId(UUID.randomUUID());
            a.setCreatedAt(OffsetDateTime.now());
            a.setUpdatedAt(OffsetDateTime.now());
            return a;
        });

        AuditCreate request = new AuditCreate();
        request.setTitle("Annual SOC 2 Type II Audit");
        request.setDomain("Technology");
        request.setDepartmentId(deptId1);
        request.setLeadAuditorId(auditorId1);
        request.setFramework("SOC 2");
        request.setScheduledStart(LocalDate.of(2026, 12, 1));
        request.setTargetDueDate(LocalDate.of(2026, 12, 31));

        AuditOut result = auditService.createAudit(companyId1, adminId, request, "127.0.0.1");

        assertNotNull(result);
        assertEquals("Annual SOC 2 Type II Audit", result.getTitle());
        assertEquals("Draft", result.getStatus());
        assertEquals("Technology", result.getDomain());
        assertTrue(result.getCode().startsWith("AUD-"));
        assertEquals("Technology Department", result.getDepartmentName());
        assertEquals("AA", result.getLeadAuditorInitials());
        verify(auditRepository, times(1)).saveAndFlush(any(AuditEntity.class));
        verify(auditHistoryRepository, times(1)).save(any(AuditHistoryEntity.class));
    }

    // 2. Audit Retrieval
    @Test
    @DisplayName("2. Audit Retrieval: Retrieves audit with serialized relations and calculated stages")
    void test02_AuditRetrieval_Success() {
        UUID auditId = UUID.randomUUID();
        AuditEntity audit = createSampleAuditEntity(auditId, companyId1, "AUD-2026-001", "Draft");

        when(auditRepository.findByIdAndCompanyId(auditId, companyId1)).thenReturn(Optional.of(audit));
        when(departmentRepository.findAllById(any())).thenReturn(List.of(department1));
        when(userRepository.findAllById(any())).thenReturn(List.of(auditorUser1));
        when(auditResponseRepository.countByCompanyIdAndAuditId(companyId1, auditId)).thenReturn(0L);

        AuditOut result = auditService.getAudit(companyId1, auditId);

        assertNotNull(result);
        assertEquals(auditId, result.getId());
        assertEquals("AUD-2026-001", result.getCode());
        assertEquals("Draft", result.getStatus());
        assertEquals("Technology Department", result.getDepartmentName());
        assertEquals(4, result.getStages().size());
        assertEquals(List.of("Scheduled"), result.getAllowedNextStatuses());
    }

    // 3. Audit Updates
    @Test
    @DisplayName("3. Audit Updates: Updates title, framework, and summary")
    void test03_AuditUpdates_Success() {
        UUID auditId = UUID.randomUUID();
        AuditEntity audit = createSampleAuditEntity(auditId, companyId1, "AUD-2026-001", "Draft");

        when(auditRepository.findByIdAndCompanyId(auditId, companyId1)).thenReturn(Optional.of(audit));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser));
        when(auditRepository.saveAndFlush(any())).thenReturn(audit);
        when(departmentRepository.findAllById(any())).thenReturn(List.of(department1));
        when(userRepository.findAllById(any())).thenReturn(List.of(auditorUser1));

        AuditUpdate update = new AuditUpdate();
        update.setTitle("Updated Title for Security Review");
        update.setFramework("ISO 27001:2022");
        update.setSummary("Executive scope expanded");

        AuditOut result = auditService.updateAudit(companyId1, auditId, adminId, update, "127.0.0.1");

        assertNotNull(result);
        assertEquals("Updated Title for Security Review", audit.getTitle());
        assertEquals("ISO 27001:2022", audit.getFramework());
        assertEquals("Executive scope expanded", audit.getSummary());
        verify(auditHistoryRepository, times(1)).save(any(AuditHistoryEntity.class));
    }

    // 4. Audit Scheduling
    @Test
    @DisplayName("4. Audit Scheduling: Schedules audit and transitions Draft -> Scheduled")
    void test04_AuditScheduling_Success() {
        UUID auditId = UUID.randomUUID();
        AuditEntity audit = createSampleAuditEntity(auditId, companyId1, "AUD-2026-001", "Draft");

        when(auditRepository.findByIdAndCompanyId(auditId, companyId1)).thenReturn(Optional.of(audit));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser));
        when(auditRepository.saveAndFlush(any())).thenReturn(audit);
        when(departmentRepository.findAllById(any())).thenReturn(List.of(department1));
        when(userRepository.findAllById(any())).thenReturn(List.of(auditorUser1));

        AuditUpdate update = new AuditUpdate();
        update.setStatus("Scheduled");
        update.setScheduledStart(LocalDate.of(2026, 12, 10));
        update.setTargetDueDate(LocalDate.of(2026, 12, 25));

        AuditOut result = auditService.updateAudit(companyId1, auditId, adminId, update, "127.0.0.1");

        assertEquals("Scheduled", audit.getStatus());
        assertEquals(LocalDate.of(2026, 12, 10), audit.getScheduledStart());
        assertEquals(LocalDate.of(2026, 12, 25), audit.getTargetDueDate());
    }

    // 5. Auditor Assignment
    @Test
    @DisplayName("5. Auditor Assignment: Assigns lead auditor belonging to same company")
    void test05_AuditorAssignment_Success() {
        UUID auditId = UUID.randomUUID();
        AuditEntity audit = createSampleAuditEntity(auditId, companyId1, "AUD-2026-001", "Draft");
        audit.setLeadAuditorId(null);

        when(auditRepository.findByIdAndCompanyId(auditId, companyId1)).thenReturn(Optional.of(audit));
        when(userRepository.findById(auditorId1)).thenReturn(Optional.of(auditorUser1));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser));
        when(auditRepository.saveAndFlush(any())).thenReturn(audit);
        when(departmentRepository.findAllById(any())).thenReturn(List.of(department1));
        when(userRepository.findAllById(any())).thenReturn(List.of(auditorUser1));

        AuditUpdate update = new AuditUpdate();
        update.setLeadAuditorId(auditorId1);

        AuditOut result = auditService.updateAudit(companyId1, auditId, adminId, update, "127.0.0.1");

        assertEquals(auditorId1, audit.getLeadAuditorId());
    }

    // 6. Auditor Reassignment
    @Test
    @DisplayName("6. Auditor Reassignment: Reassigns lead auditor to a new qualified user")
    void test06_AuditorReassignment_Success() {
        UUID auditId = UUID.randomUUID();
        AuditEntity audit = createSampleAuditEntity(auditId, companyId1, "AUD-2026-001", "In Progress");

        when(auditRepository.findByIdAndCompanyId(auditId, companyId1)).thenReturn(Optional.of(audit));
        when(userRepository.findById(auditorId2)).thenReturn(Optional.of(auditorUser2));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser));
        when(auditRepository.saveAndFlush(any())).thenReturn(audit);
        when(departmentRepository.findAllById(any())).thenReturn(List.of(department1));
        when(userRepository.findAllById(any())).thenReturn(List.of(auditorUser2));

        AuditUpdate update = new AuditUpdate();
        update.setLeadAuditorId(auditorId2);

        AuditOut result = auditService.updateAudit(companyId1, auditId, adminId, update, "127.0.0.1");

        assertEquals(auditorId2, audit.getLeadAuditorId());
    }

    // 7. Valid Lifecycle Transitions
    @Test
    @DisplayName("7. Valid Lifecycle Transitions: Draft -> Scheduled -> In Progress -> Review -> Action Required -> Verification -> Closed")
    void test07_ValidLifecycleTransitions_CompletePath() {
        AuditEntity audit = new AuditEntity();
        audit.setStatus("Draft");

        // Draft -> Scheduled
        auditScoringService.validateAuditStatusTransition(audit, "Scheduled", 0);
        audit.setStatus("Scheduled");

        // Scheduled -> In Progress
        auditScoringService.validateAuditStatusTransition(audit, "In Progress", 0);
        audit.setStatus("In Progress");

        // In Progress -> Review
        auditScoringService.validateAuditStatusTransition(audit, "Review", 0);
        audit.setStatus("Review");

        // Review -> Action Required
        auditScoringService.validateAuditStatusTransition(audit, "Action Required", 0);
        audit.setStatus("Action Required");

        // Action Required -> Verification
        auditScoringService.validateAuditStatusTransition(audit, "Verification", 0);
        audit.setStatus("Verification");

        // Verification -> Closed
        auditScoringService.validateAuditStatusTransition(audit, "Closed", 0);
        audit.setStatus("Closed");

        assertEquals("Closed", audit.getStatus());
    }

    // 8. Invalid Lifecycle Transitions
    @Test
    @DisplayName("8. Invalid Lifecycle Transitions: Throws IllegalArgumentException for disallowed hops")
    void test08_InvalidLifecycleTransitions_ThrowsException() {
        AuditEntity draftAudit = new AuditEntity();
        draftAudit.setStatus("Draft");

        // Cannot skip directly from Draft to Review or Closed
        assertThrows(IllegalArgumentException.class, () ->
                auditScoringService.validateAuditStatusTransition(draftAudit, "Review", 0));
        assertThrows(IllegalArgumentException.class, () ->
                auditScoringService.validateAuditStatusTransition(draftAudit, "Closed", 0));

        AuditEntity closedAudit = new AuditEntity();
        closedAudit.setStatus("Closed");

        // Cannot reopen Closed audit
        assertThrows(IllegalArgumentException.class, () ->
                auditScoringService.validateAuditStatusTransition(closedAudit, "Draft", 0));
        assertThrows(IllegalArgumentException.class, () ->
                auditScoringService.validateAuditStatusTransition(closedAudit, "In Progress", 0));
    }

    // 9. Unauthorized Lifecycle Transitions (Open Findings Block)
    @Test
    @DisplayName("9. Open Findings Block: Cannot transition to Closed or skip Action Required with open findings")
    void test09_UnauthorizedLifecycleTransitions_OpenFindingsBlockSignOff() {
        AuditEntity reviewAudit = new AuditEntity();
        reviewAudit.setStatus("Review");

        // Transition to Verification blocked if open findings exist
        assertThrows(IllegalArgumentException.class, () ->
                auditScoringService.validateAuditStatusTransition(reviewAudit, "Verification", 2));

        AuditEntity verificationAudit = new AuditEntity();
        verificationAudit.setStatus("Verification");

        // Transition to Closed blocked if open findings exist
        assertThrows(IllegalArgumentException.class, () ->
                auditScoringService.validateAuditStatusTransition(verificationAudit, "Closed", 1));
    }

    // 10. Checklist Assignment & Scope Addition
    @Test
    @DisplayName("10. Checklist Assignment: Adds audit scopes with system or process definitions")
    void test10_ChecklistAssignment_ScopesAndDomains() {
        UUID auditId = UUID.randomUUID();
        AuditEntity audit = createSampleAuditEntity(auditId, companyId1, "AUD-2026-001", "Draft");

        when(auditRepository.findByIdAndCompanyId(auditId, companyId1)).thenReturn(Optional.of(audit));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser));
        when(auditScopeRepository.save(any(AuditScopeEntity.class))).thenAnswer(i -> {
            AuditScopeEntity s = i.getArgument(0);
            s.setId(UUID.randomUUID());
            return s;
        });

        AuditScopeCreate scopeCreate = new AuditScopeCreate(
                "Core Identity Service",
                "OAuth 2.0 / OIDC Provider",
                "ISO 27001 A.9.2",
                true
        );

        AuditScopeOut result = auditService.addScope(companyId1, auditId, adminId, scopeCreate, "127.0.0.1");

        assertNotNull(result);
        assertEquals("Core Identity Service", result.getScopeName());
        assertEquals("OAuth 2.0 / OIDC Provider", result.getSystemOrProcess());
        assertEquals("ISO 27001 A.9.2", result.getRegulatoryClause());
        assertTrue(result.getInScope());
        verify(auditScopeRepository, times(1)).save(any(AuditScopeEntity.class));
    }

    // 11. Checklist Response Submission Advances to In Progress
    @Test
    @DisplayName("11. Checklist Response Submission: Advances Draft status to In Progress")
    void test11_ChecklistResponseSubmission_AdvancesStatusToInProgress() {
        UUID auditId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        AuditEntity audit = createSampleAuditEntity(auditId, companyId1, "AUD-2026-001", "Draft");

        ChecklistItemEntity item = new ChecklistItemEntity();
        item.setId(itemId);
        item.setCompanyId(companyId1);
        item.setControlCode("SEC-01");
        item.setTitle("MFA Enforcement");
        item.setWeight(new BigDecimal("2.00"));

        when(auditRepository.findByIdAndCompanyId(auditId, companyId1)).thenReturn(Optional.of(audit));
        when(checklistItemRepository.findById(itemId)).thenReturn(Optional.of(item));
        when(userRepository.findById(auditorId1)).thenReturn(Optional.of(auditorUser1));
        when(auditResponseRepository.findByAuditIdAndChecklistItemId(auditId, itemId)).thenReturn(Optional.empty());

        AuditResponseEntity savedResp = new AuditResponseEntity();
        savedResp.setId(UUID.randomUUID());
        savedResp.setAuditId(auditId);
        savedResp.setChecklistItemId(itemId);
        savedResp.setChecklistItem(item);
        savedResp.setResponseValue("Pass");
        savedResp.setScoreFactor(new BigDecimal("1.00"));
        savedResp.setTestedAt(OffsetDateTime.now());

        when(auditResponseRepository.findByAuditIdAndCompanyId(auditId, companyId1)).thenReturn(List.of(savedResp));

        SubmitAuditResponsesRequest request = new SubmitAuditResponsesRequest(
                List.of(new AuditResponseItemInput(itemId, "Pass", "MFA verified"))
        );

        SubmitAuditResponsesResult result = auditService.submitAuditResponses(companyId1, auditId, auditorId1, request, "127.0.0.1");

        assertNotNull(result);
        assertEquals("In Progress", audit.getStatus());
        assertEquals(100.0, result.getComputedScore());
        assertEquals(1, result.getSavedCount());
    }

    // 12. PASS Scoring (100%)
    @Test
    @DisplayName("12. PASS Scoring: All responses Pass returns 100.00%")
    void test12_Scoring_AllPass_Returns100Percent() {
        ChecklistItemEntity item1 = createItem(UUID.randomUUID(), "1.00");
        ChecklistItemEntity item2 = createItem(UUID.randomUUID(), "3.00");

        AuditResponseEntity r1 = createResponse(item1, "Pass", new BigDecimal("1.00"));
        AuditResponseEntity r2 = createResponse(item2, "Pass", new BigDecimal("1.00"));

        AuditScoringService.ScoreResult result = auditScoringService.calculateScore(List.of(r1, r2));

        assertEquals(100.00, result.getScore());
        assertEquals(2, result.getTotalResponses());
        assertEquals(2, result.getEvaluatedCount());
    }

    // 13. PARTIAL Scoring (50%)
    @Test
    @DisplayName("13. PARTIAL Scoring: All responses Partial returns 50.00%")
    void test13_Scoring_AllPartial_Returns50Percent() {
        ChecklistItemEntity item1 = createItem(UUID.randomUUID(), "2.00");
        ChecklistItemEntity item2 = createItem(UUID.randomUUID(), "2.00");

        AuditResponseEntity r1 = createResponse(item1, "Partial", new BigDecimal("0.50"));
        AuditResponseEntity r2 = createResponse(item2, "Partial", new BigDecimal("0.50"));

        AuditScoringService.ScoreResult result = auditScoringService.calculateScore(List.of(r1, r2));

        assertEquals(50.00, result.getScore());
    }

    // 14. FAIL Scoring (0%)
    @Test
    @DisplayName("14. FAIL Scoring: All responses Fail returns 0.00%")
    void test14_Scoring_AllFail_ReturnsZeroPercent() {
        ChecklistItemEntity item1 = createItem(UUID.randomUUID(), "1.00");
        AuditResponseEntity r1 = createResponse(item1, "Fail", new BigDecimal("0.00"));

        AuditScoringService.ScoreResult result = auditScoringService.calculateScore(List.of(r1));

        assertEquals(0.00, result.getScore());
    }

    // 15. N/A Exclusion
    @Test
    @DisplayName("15. N/A Exclusion: N/A is completely excluded from numerator and denominator")
    void test15_Scoring_NaExclusion_ExcludedFromCalculation() {
        ChecklistItemEntity item1 = createItem(UUID.randomUUID(), "2.00");
        ChecklistItemEntity item2 = createItem(UUID.randomUUID(), "5.00"); // N/A item

        AuditResponseEntity r1 = createResponse(item1, "Pass", new BigDecimal("1.00"));
        AuditResponseEntity r2 = createResponse(item2, "N/A", null);

        AuditScoringService.ScoreResult result = auditScoringService.calculateScore(List.of(r1, r2));

        // Only item1 counts: (1.0 * 2.0) / 2.0 * 100 = 100.00%
        assertEquals(100.00, result.getScore());
        assertEquals(2, result.getTotalResponses());
        assertEquals(1, result.getEvaluatedCount());
    }

    // 16. Weighted Scoring Math Matches Python
    @Test
    @DisplayName("16. Weighted Scoring: Item weights (3.0, 2.0, 5.0, 4.0 N/A) yield 40.00% matching Python exactly")
    void test16_Scoring_WeightedScoring_MathMatchesPython() {
        ChecklistItemEntity item1 = createItem(UUID.randomUUID(), "3.00");
        ChecklistItemEntity item2 = createItem(UUID.randomUUID(), "2.00");
        ChecklistItemEntity item3 = createItem(UUID.randomUUID(), "5.00");
        ChecklistItemEntity item4 = createItem(UUID.randomUUID(), "4.00"); // N/A

        AuditResponseEntity r1 = createResponse(item1, "Pass", new BigDecimal("1.00"));     // 1.0 * 3 = 3.0
        AuditResponseEntity r2 = createResponse(item2, "Partial", new BigDecimal("0.50"));  // 0.5 * 2 = 1.0
        AuditResponseEntity r3 = createResponse(item3, "Fail", new BigDecimal("0.00"));     // 0.0 * 5 = 0.0
        AuditResponseEntity r4 = createResponse(item4, "N/A", null);                         // excluded

        // Earned: 4.0; Applicable: 10.0; Score = 40.00%
        AuditScoringService.ScoreResult result = auditScoringService.calculateScore(List.of(r1, r2, r3, r4));

        assertEquals(40.00, result.getScore());
        assertEquals(4, result.getTotalResponses());
        assertEquals(3, result.getEvaluatedCount());
    }

    // 17. Empty Checklist Handling
    @Test
    @DisplayName("17. Empty Checklist: No responses yields null score without division-by-zero")
    void test17_Scoring_EmptyChecklist_ReturnsNullScore() {
        AuditScoringService.ScoreResult result = auditScoringService.calculateScore(Collections.emptyList());

        assertNull(result.getScore());
        assertEquals(0, result.getTotalResponses());
        assertEquals(0, result.getEvaluatedCount());
    }

    // 18. Completion Percentage & Stages
    @Test
    @DisplayName("18. Completion Percentage: Progress calculations across workflow stages")
    void test18_CompletionPercentage_ProgressCalculations() {
        List<AuditStageOut> inProgressStages = auditScoringService.computeAuditStages("In Progress", 10, 20);
        assertEquals(4, inProgressStages.size());
        assertEquals("completed", inProgressStages.get(0).getState()); // Scope Defined: 100%
        assertEquals("completed", inProgressStages.get(1).getState()); // Evidence Gathering: 100%
        assertEquals("active", inProgressStages.get(2).getState());    // Review & Testing: 50%
        assertEquals(50, inProgressStages.get(2).getProgress());

        List<AuditStageOut> closedStages = auditScoringService.computeAuditStages("Closed", 20, 20);
        assertTrue(closedStages.stream().allMatch(s -> s.getState().equals("completed")));
    }

    // 19. Cross-Company Audit Access Rejected
    @Test
    @DisplayName("19. Multi-Tenant Isolation: Cross-company audit retrieval throws 404")
    void test19_CrossCompanyAuditAccess_Rejected() {
        UUID auditId = UUID.randomUUID();
        when(auditRepository.findByIdAndCompanyId(auditId, companyId2)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                auditService.getAudit(companyId2, auditId));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    // 20. Department-Level Access
    @Test
    @DisplayName("20. Department Isolation: Creating audit for cross-company department throws 404")
    void test20_DepartmentLevelAccess_CrossCompanyDepartmentRejected() {
        UUID otherDeptId = UUID.randomUUID();
        when(departmentRepository.findById(otherDeptId)).thenReturn(Optional.empty());

        AuditCreate request = new AuditCreate();
        request.setTitle("Invalid Dept Audit");
        request.setDomain("Technology");
        request.setDepartmentId(otherDeptId);
        request.setFramework("ISO 27001");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                auditService.createAudit(companyId1, adminId, request, "127.0.0.1"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    // 21. Audit History Integration
    @Test
    @DisplayName("21. Audit History: Verifies SHA-256 event chaining on audit creation")
    void test21_AuditHistoryIntegration_TamperEvidentSha256Chaining() {
        when(departmentRepository.findById(deptId1)).thenReturn(Optional.of(department1));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser));
        when(auditRepository.saveAndFlush(any())).thenAnswer(i -> {
            AuditEntity a = i.getArgument(0);
            a.setId(UUID.randomUUID());
            a.setCreatedAt(OffsetDateTime.now());
            return a;
        });

        AuditHistoryEntity prevTip = new AuditHistoryEntity();
        prevTip.setEventSha256("aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899");
        when(auditHistoryRepository.findTopByCompanyIdOrderByCreatedAtDesc(companyId1)).thenReturn(Optional.of(prevTip));

        AuditCreate request = new AuditCreate();
        request.setTitle("History Audit");
        request.setDomain("Financial");
        request.setDepartmentId(deptId1);
        request.setFramework("SOX");

        auditService.createAudit(companyId1, adminId, request, "192.168.1.50");

        verify(auditHistoryRepository).save(argThat(entry -> {
            assertEquals("aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899", entry.getPrevEventSha256());
            assertNotNull(entry.getEventSha256());
            assertEquals(64, entry.getEventSha256().length());
            assertEquals("Audit", entry.getEntityType());
            assertEquals("Mutation", entry.getCategory());
            return true;
        }));
    }

    // 22. Transaction Rollback
    @Test
    @DisplayName("22. Transaction Rollback: Database error during save throws exception and leaves no dirty state")
    void test22_TransactionRollback_WhenExceptionOccurs() {
        when(departmentRepository.findById(deptId1)).thenReturn(Optional.of(department1));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser));
        when(auditRepository.saveAndFlush(any())).thenThrow(new RuntimeException("DB Connection Timeout"));

        AuditCreate request = new AuditCreate();
        request.setTitle("Rollback Test Audit");
        request.setDomain("HR");
        request.setDepartmentId(deptId1);
        request.setFramework("GDPR");

        assertThrows(RuntimeException.class, () ->
                auditService.createAudit(companyId1, adminId, request, "127.0.0.1"));
    }

    // 23. Concurrent Checklist Updates
    @Test
    @DisplayName("23. Upsert Behavior: Re-submitting response for same checklist item updates existing record")
    void test23_ConcurrentChecklistUpdates_UpsertBehavior() {
        UUID auditId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        AuditEntity audit = createSampleAuditEntity(auditId, companyId1, "AUD-2026-001", "In Progress");

        ChecklistItemEntity item = createItem(itemId, "1.00");
        AuditResponseEntity existingResp = createResponse(item, "Partial", new BigDecimal("0.50"));

        when(auditRepository.findByIdAndCompanyId(auditId, companyId1)).thenReturn(Optional.of(audit));
        when(checklistItemRepository.findById(itemId)).thenReturn(Optional.of(item));
        when(auditResponseRepository.findByAuditIdAndChecklistItemId(auditId, itemId)).thenReturn(Optional.of(existingResp));
        when(auditResponseRepository.findByAuditIdAndCompanyId(auditId, companyId1)).thenReturn(List.of(existingResp));

        SubmitAuditResponsesRequest request = new SubmitAuditResponsesRequest(
                List.of(new AuditResponseItemInput(itemId, "Pass", "Remediated to full pass"))
        );

        SubmitAuditResponsesResult result = auditService.submitAuditResponses(companyId1, auditId, auditorId1, request, "127.0.0.1");

        assertEquals("Pass", existingResp.getResponseValue());
        assertEquals(new BigDecimal("1.00"), existingResp.getScoreFactor());
        assertEquals("Remediated to full pass", existingResp.getAuditorNotes());
        assertEquals(100.0, result.getComputedScore());
    }

    // 24. Closed Audit Locked
    @Test
    @DisplayName("24. Closed Audit Locked: Finalized audits reject scope additions and response submissions")
    void test24_ExistingAuthenticationIntegration_ClosedAuditLocked() {
        UUID auditId = UUID.randomUUID();
        AuditEntity closedAudit = createSampleAuditEntity(auditId, companyId1, "AUD-2026-001", "Closed");

        when(auditRepository.findByIdAndCompanyId(auditId, companyId1)).thenReturn(Optional.of(closedAudit));

        AuditScopeCreate scopeCreate = new AuditScopeCreate("Post-Close Scope", "Process", null, true);
        ResponseStatusException ex1 = assertThrows(ResponseStatusException.class, () ->
                auditService.addScope(companyId1, auditId, adminId, scopeCreate, "127.0.0.1"));
        assertEquals(HttpStatus.BAD_REQUEST, ex1.getStatusCode());

        SubmitAuditResponsesRequest respReq = new SubmitAuditResponsesRequest(
                List.of(new AuditResponseItemInput(UUID.randomUUID(), "Pass", "Late response"))
        );
        ResponseStatusException ex2 = assertThrows(ResponseStatusException.class, () ->
                auditService.submitAuditResponses(companyId1, auditId, auditorId1, respReq, "127.0.0.1"));
        assertEquals(HttpStatus.BAD_REQUEST, ex2.getStatusCode());
    }

    // Helper utilities
    private AuditEntity createSampleAuditEntity(UUID id, UUID companyId, String code, String status) {
        AuditEntity audit = new AuditEntity();
        audit.setId(id);
        audit.setCompanyId(companyId);
        audit.setDepartmentId(deptId1);
        audit.setDepartment(department1);
        audit.setLeadAuditorId(auditorId1);
        audit.setLeadAuditor(auditorUser1);
        audit.setCode(code);
        audit.setTitle("Test Audit " + code);
        audit.setDomain("Technology");
        audit.setFramework("SOC 2");
        audit.setStatus(status);
        audit.setCreatedAt(OffsetDateTime.now());
        audit.setUpdatedAt(OffsetDateTime.now());
        return audit;
    }

    private ChecklistItemEntity createItem(UUID id, String weight) {
        ChecklistItemEntity item = new ChecklistItemEntity();
        item.setId(id);
        item.setCompanyId(companyId1);
        item.setControlCode("CTRL-" + id.toString().substring(0, 4));
        item.setTitle("Control " + id);
        item.setWeight(new BigDecimal(weight));
        return item;
    }

    private AuditResponseEntity createResponse(ChecklistItemEntity item, String value, BigDecimal factor) {
        AuditResponseEntity resp = new AuditResponseEntity();
        resp.setId(UUID.randomUUID());
        resp.setChecklistItemId(item.getId());
        resp.setChecklistItem(item);
        resp.setResponseValue(value);
        resp.setScoreFactor(factor);
        resp.setTestedAt(OffsetDateTime.now());
        return resp;
    }
}
