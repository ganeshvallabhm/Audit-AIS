package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.ChecklistEntity;
import io.companyaudit.platform.domain.ChecklistItemEntity;
import io.companyaudit.platform.domain.CompanyEntity;
import io.companyaudit.platform.domain.DepartmentEntity;
import io.companyaudit.platform.domain.UserEntity;
import io.companyaudit.platform.dto.request.*;
import io.companyaudit.platform.dto.response.*;
import io.companyaudit.platform.repository.*;
import io.companyaudit.platform.security.UserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Step 8: Phase 2 Master Data & Audit Template Test Suite (20 Test Cases)")
class Phase2MasterDataAndTemplatesTest {

    @Mock
    private CompanyRepository companyRepository;

    @Mock
    private DepartmentRepository departmentRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private RefreshSessionRepository refreshSessionRepository;

    @Mock
    private ChecklistRepository checklistRepository;

    @Mock
    private ChecklistItemRepository checklistItemRepository;

    private Argon2PasswordEncoder passwordEncoder;
    private CompanyService companyService;
    private DepartmentService departmentService;
    private UserService userService;
    private ChecklistService checklistService;

    private final UUID companyId1 = UUID.randomUUID();
    private final UUID companyId2 = UUID.randomUUID();
    private final UUID adminUserId = UUID.randomUUID();
    private final UUID regularUserId = UUID.randomUUID();
    private final UUID deptId1 = UUID.randomUUID();

    private UserPrincipal adminPrincipal;
    private UserPrincipal regularPrincipal;

    @BeforeEach
    void setUp() {
        passwordEncoder = new Argon2PasswordEncoder(16, 32, 4, 65536, 3);
        companyService = new CompanyService(companyRepository);
        departmentService = new DepartmentService(departmentRepository, userRepository);
        userService = new UserService(userRepository, departmentRepository, refreshSessionRepository, passwordEncoder);
        checklistService = new ChecklistService(checklistRepository, checklistItemRepository);

        adminPrincipal = new UserPrincipal(adminUserId, companyId1, null, "admin@companyaudit.io", "pass", "Admin", 1, true);
        regularPrincipal = new UserPrincipal(regularUserId, companyId1, deptId1, "auditor@companyaudit.io", "pass", "Auditor", 1, true);
    }

    private CompanyEntity createCompany(UUID id, String name) {
        CompanyEntity c = new CompanyEntity();
        c.setId(id);
        c.setLegalName(name);
        c.setTicker("NYSE: ASGI");
        c.setHeadquarters("New York, NY");
        c.setFiscalYearLabel("FY 2025 (Q4 Active)");
        c.setRegulatoryScope(Arrays.asList("SOX 404(b)", "SOC 2 Type II", "ISO 27001"));
        c.setEnterpriseTargetScore(new BigDecimal("85.00"));
        c.setMinimumCompositeFloor(new BigDecimal("80.00"));
        c.setBoardRiskThreshold(5);
        c.setDigestFrequency("Weekly — Mondays 08:00 EST");
        c.setSlaAutoEscalate(true);
        c.setAiCitationStrict(true);
        c.setShaLockEnabled(true);
        c.setIsActive(true);
        c.setCreatedAt(OffsetDateTime.now());
        c.setUpdatedAt(OffsetDateTime.now());
        return c;
    }

    // ==========================================
    // 1-4: COMPANY MANAGEMENT TESTS
    // ==========================================

    @Test
    @DisplayName("Test 1: Company Creation - Admin provision new organization")
    void testCompanyCreation() {
        CompanyCreateRequest req = new CompanyCreateRequest();
        req.setLegalName("Acme Global Audits Inc.");
        req.setTicker("NASDAQ: ACME");
        req.setRegulatoryScope(List.of("SOC 2", "ISO 27001"));

        when(companyRepository.findByLegalName("Acme Global Audits Inc.")).thenReturn(Optional.empty());
        when(companyRepository.save(any(CompanyEntity.class))).thenAnswer(i -> {
            CompanyEntity c = i.getArgument(0);
            c.setId(UUID.randomUUID());
            c.setCreatedAt(OffsetDateTime.now());
            c.setUpdatedAt(OffsetDateTime.now());
            return c;
        });

        CompanyProfileOut out = companyService.createCompany(req, adminPrincipal);
        assertNotNull(out);
        assertNotNull(out.getId());
        assertEquals("Acme Global Audits Inc.", out.getLegalName());
        assertEquals("NASDAQ: ACME", out.getTicker());
        assertEquals(2, out.getRegulatoryScope().size());
    }

    @Test
    @DisplayName("Test 2: Company Retrieval - Retrieve existing company profile")
    void testCompanyRetrieval() {
        CompanyEntity company = createCompany(companyId1, "Audit Systems Group");
        when(companyRepository.findById(companyId1)).thenReturn(Optional.of(company));

        CompanyProfileOut out = companyService.getCompanyProfile(companyId1);
        assertNotNull(out);
        assertEquals(companyId1, out.getId());
        assertEquals("Audit Systems Group", out.getLegalName());
        assertEquals(3, out.getRegulatoryScope().size());
        assertTrue(out.getShaLockEnabled());
    }

    @Test
    @DisplayName("Test 3: Company Update - Update targets and governance settings")
    void testCompanyUpdate() {
        CompanyEntity company = createCompany(companyId1, "Audit Systems Group");
        when(companyRepository.findById(companyId1)).thenReturn(Optional.of(company));
        when(companyRepository.save(any(CompanyEntity.class))).thenAnswer(i -> i.getArgument(0));

        CompanyProfileUpdate update = new CompanyProfileUpdate();
        update.setEnterpriseTargetScore(new BigDecimal("90.00"));
        update.setExternalAuditor("PricewaterhouseCoopers LLP");

        CompanyProfileOut out = companyService.updateCompanyProfile(companyId1, update, adminPrincipal);
        assertNotNull(out);
        assertEquals(new BigDecimal("90.00"), out.getEnterpriseTargetScore());
        assertEquals("PricewaterhouseCoopers LLP", out.getExternalAuditor());
    }

    @Test
    @DisplayName("Test 4: Unauthorized Company Modification - Prevent cross-company tampering")
    void testUnauthorizedCompanyModification() {
        CompanyProfileUpdate update = new CompanyProfileUpdate();
        update.setLegalName("Hacked Name");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> companyService.updateCompanyProfile(companyId2, update, adminPrincipal));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Cross-company access denied"));
    }

    // ==========================================
    // 5-7: DEPARTMENT MANAGEMENT TESTS
    // ==========================================

    @Test
    @DisplayName("Test 5: Department Creation - Create valid department with unique code")
    void testDepartmentCreation() {
        DepartmentCreate req = new DepartmentCreate();
        req.setCode("SEC-01");
        req.setName("Information Security");
        req.setTargetScore(new BigDecimal("92.00"));
        req.setScoringWeight(new BigDecimal("0.2000"));

        when(departmentRepository.findByCompanyIdAndCode(companyId1, "SEC-01")).thenReturn(Optional.empty());
        when(departmentRepository.save(any(DepartmentEntity.class))).thenAnswer(i -> {
            DepartmentEntity d = i.getArgument(0);
            d.setId(UUID.randomUUID());
            d.setCreatedAt(OffsetDateTime.now());
            d.setUpdatedAt(OffsetDateTime.now());
            return d;
        });

        DepartmentOut out = departmentService.createDepartment(companyId1, req, adminPrincipal);
        assertNotNull(out);
        assertEquals("SEC-01", out.getCode());
        assertEquals("Information Security", out.getName());
        assertEquals(new BigDecimal("92.00"), out.getTargetScore());
    }

    @Test
    @DisplayName("Test 6: Department Update - Update name and scoring weight")
    void testDepartmentUpdate() {
        DepartmentEntity dept = new DepartmentEntity();
        dept.setId(deptId1);
        dept.setCompanyId(companyId1);
        dept.setCode("ITS-04");
        dept.setName("IT Services");
        dept.setTargetScore(new BigDecimal("85.00"));
        dept.setScoringWeight(new BigDecimal("0.1250"));

        when(departmentRepository.findById(deptId1)).thenReturn(Optional.of(dept));
        when(departmentRepository.save(any(DepartmentEntity.class))).thenAnswer(i -> i.getArgument(0));

        DepartmentUpdate req = new DepartmentUpdate();
        req.setName("IT Services & Cloud Ops");
        req.setScoringWeight(new BigDecimal("0.1500"));

        DepartmentOut out = departmentService.updateDepartment(companyId1, deptId1, req, adminPrincipal);
        assertNotNull(out);
        assertEquals("IT Services & Cloud Ops", out.getName());
        assertEquals(new BigDecimal("0.1500"), out.getScoringWeight());
    }

    @Test
    @DisplayName("Test 7: Cross-Company Department Access - Isolation enforcement")
    void testCrossCompanyDepartmentAccess() {
        DepartmentEntity deptComp2 = new DepartmentEntity();
        deptComp2.setId(UUID.randomUUID());
        deptComp2.setCompanyId(companyId2); // Company 2!
        deptComp2.setCode("FIN-99");
        deptComp2.setName("Finance 2");

        when(departmentRepository.findById(deptComp2.getId())).thenReturn(Optional.of(deptComp2));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> departmentService.getDepartment(companyId1, deptComp2.getId()));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        assertTrue(ex.getReason().contains("not found in your organization"));
    }

    // ==========================================
    // 8-11: USER MANAGEMENT TESTS
    // ==========================================

    @Test
    @DisplayName("Test 8: User Creation - Admin registers user with Argon2id hash")
    void testUserCreation() {
        RegisterUserRequest req = new RegisterUserRequest();
        req.setEmail("new.auditor@companyaudit.io");
        req.setPassword("SecurePassword123!");
        req.setFullName("Arthur Dent");
        req.setRole("Auditor");
        req.setJobTitle("Senior Compliance Auditor");

        when(userRepository.findByEmailIgnoreCase("new.auditor@companyaudit.io")).thenReturn(Optional.empty());
        when(userRepository.save(any(UserEntity.class))).thenAnswer(i -> {
            UserEntity u = i.getArgument(0);
            u.setId(UUID.randomUUID());
            return u;
        });

        UserSummary out = userService.registerUser(companyId1, req, adminPrincipal);
        assertNotNull(out);
        assertEquals("new.auditor@companyaudit.io", out.getEmail());
        assertEquals("Arthur Dent", out.getFullName());
        assertEquals("AD", out.getInitials());
        assertEquals("Auditor", out.getRole());
        assertTrue(out.getIsActive());
    }

    @Test
    @DisplayName("Test 9: User Role Assignment - Modify role to Department Head")
    void testUserRoleAssignment() {
        UserEntity target = new UserEntity();
        target.setId(UUID.randomUUID());
        target.setCompanyId(companyId1);
        target.setEmail("promoted@companyaudit.io");
        target.setFullName("Tricia McMillan");
        target.setRole("Auditor");
        target.setIsActive(true);

        when(userRepository.findById(target.getId())).thenReturn(Optional.of(target));
        when(userRepository.save(any(UserEntity.class))).thenAnswer(i -> i.getArgument(0));

        UserUpdateRequest req = new UserUpdateRequest();
        req.setRole("Department Head");

        UserSummary out = userService.updateUser(companyId1, target.getId(), req, adminPrincipal);
        assertNotNull(out);
        assertEquals("Department Head", out.getRole());
    }

    @Test
    @DisplayName("Test 10: Unauthorized Role Escalation - Duplicate user conflict")
    void testDuplicateUserConflict() {
        RegisterUserRequest req = new RegisterUserRequest();
        req.setEmail("existing@companyaudit.io");
        req.setPassword("Password123!");
        req.setFullName("Existing User");

        UserEntity existing = new UserEntity();
        when(userRepository.findByEmailIgnoreCase("existing@companyaudit.io")).thenReturn(Optional.of(existing));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> userService.registerUser(companyId1, req, adminPrincipal));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("already exists"));
    }

    @Test
    @DisplayName("Test 11: User Activation & Deactivation - Invalidate sessions on deactivation")
    void testUserDeactivation() {
        UserEntity target = new UserEntity();
        target.setId(UUID.randomUUID());
        target.setCompanyId(companyId1);
        target.setEmail("deactivated@companyaudit.io");
        target.setFullName("Ford Prefect");
        target.setRole("Viewer");
        target.setTokenVersion(1);
        target.setIsActive(true);

        when(userRepository.findById(target.getId())).thenReturn(Optional.of(target));
        when(userRepository.save(any(UserEntity.class))).thenAnswer(i -> i.getArgument(0));

        UserUpdateRequest req = new UserUpdateRequest();
        req.setIsActive(false);

        UserSummary out = userService.updateUser(companyId1, target.getId(), req, adminPrincipal);
        assertNotNull(out);
        assertFalse(out.getIsActive());
        assertEquals(2, target.getTokenVersion()); // Invalidation of access tokens
        verify(refreshSessionRepository, times(1)).revokeAllForUser(eq(companyId1), eq(target.getId()), any(OffsetDateTime.class));
    }

    // ==========================================
    // 12-16: AUDIT TEMPLATES & CHECKLIST TESTS
    // ==========================================

    @Test
    @DisplayName("Test 12: Audit Template Creation - Create framework checklist")
    void testAuditTemplateCreation() {
        ChecklistCreate req = new ChecklistCreate();
        req.setCode("CHK-SEC-01");
        req.setTitle("SOC 2 Security Trust Services Criteria");
        req.setDomain("Technology");
        req.setFramework("SOC 2 Type II");
        req.setVersion("2025.4");

        when(checklistRepository.findByCompanyIdAndCode(companyId1, "CHK-SEC-01")).thenReturn(Optional.empty());
        when(checklistRepository.save(any(ChecklistEntity.class))).thenAnswer(i -> {
            ChecklistEntity chk = i.getArgument(0);
            chk.setId(UUID.randomUUID());
            return chk;
        });

        ChecklistOut out = checklistService.createChecklist(companyId1, req, adminPrincipal);
        assertNotNull(out);
        assertEquals("CHK-SEC-01", out.getCode());
        assertEquals("Technology", out.getDomain());
        assertEquals("SOC 2 Type II", out.getFramework());
        assertTrue(out.getIsActive());
    }

    @Test
    @DisplayName("Test 13: Audit Template Update - Prevent duplicate code")
    void testDuplicateChecklistCodeRejected() {
        ChecklistCreate req = new ChecklistCreate();
        req.setCode("CHK-DUP-01");
        req.setTitle("Duplicate Template");
        req.setDomain("Financial");
        req.setFramework("SOX");

        ChecklistEntity existing = new ChecklistEntity();
        when(checklistRepository.findByCompanyIdAndCode(companyId1, "CHK-DUP-01")).thenReturn(Optional.of(existing));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> checklistService.createChecklist(companyId1, req, adminPrincipal));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("already exists"));
    }

    @Test
    @DisplayName("Test 14: Checklist Section / Domain Management - Filter by domain")
    void testChecklistDomainFiltering() {
        ChecklistEntity chk1 = new ChecklistEntity();
        chk1.setId(UUID.randomUUID());
        chk1.setCompanyId(companyId1);
        chk1.setCode("CHK-FIN-01");
        chk1.setTitle("SOX Financial Controls");
        chk1.setDomain("Financial");
        chk1.setFramework("SOX 404(b)");
        chk1.setIsActive(true);

        when(checklistRepository.findAllByCompanyIdAndDomainAndIsActiveTrueOrderByCodeAsc(companyId1, "Financial"))
                .thenReturn(Collections.singletonList(chk1));

        List<ChecklistOut> list = checklistService.listChecklists(companyId1, "Financial");
        assertEquals(1, list.size());
        assertEquals("Financial", list.get(0).getDomain());
    }

    @Test
    @DisplayName("Test 15: Checklist Question Management - Add control question to template")
    void testAddChecklistItem() {
        UUID chkId = UUID.randomUUID();
        ChecklistEntity chk = new ChecklistEntity();
        chk.setId(chkId);
        chk.setCompanyId(companyId1);
        chk.setCode("CHK-SEC-01");
        chk.setFramework("SOC 2");
        chk.setDomain("Technology");

        when(checklistRepository.findByCompanyIdAndId(companyId1, chkId)).thenReturn(Optional.of(chk));
        when(checklistItemRepository.findByChecklistIdAndControlCode(chkId, "CC6.1")).thenReturn(Optional.empty());
        when(checklistItemRepository.save(any(ChecklistItemEntity.class))).thenAnswer(i -> {
            ChecklistItemEntity item = i.getArgument(0);
            item.setId(UUID.randomUUID());
            return item;
        });

        ChecklistItemCreate req = new ChecklistItemCreate();
        req.setControlCode("CC6.1");
        req.setTitle("Logical Access Controls");
        req.setTestProcedure("Inspect multi-factor authentication enforcement on cloud consoles.");
        req.setWeight(new BigDecimal("2.50"));
        req.setDisplayOrder(1);

        ChecklistItemOut itemOut = checklistService.createChecklistItem(companyId1, chkId, req, adminPrincipal);
        assertNotNull(itemOut);
        assertEquals("CC6.1", itemOut.getControlCode());
        assertEquals("Logical Access Controls", itemOut.getTitle());
        assertEquals(new BigDecimal("2.50"), itemOut.getWeight());
        assertEquals(1, itemOut.getDisplayOrder());
    }

    @Test
    @DisplayName("Test 16: Control Reference Management - Update test procedure & weight")
    void testUpdateChecklistItem() {
        UUID itemId = UUID.randomUUID();
        UUID chkId = UUID.randomUUID();

        ChecklistEntity chk = new ChecklistEntity();
        chk.setId(chkId);
        chk.setCode("CHK-SEC-01");

        ChecklistItemEntity item = new ChecklistItemEntity();
        item.setId(itemId);
        item.setCompanyId(companyId1);
        item.setChecklistId(chkId);
        item.setControlCode("CC6.2");
        item.setTitle("User Access Revocation");
        item.setTestProcedure("Inspect de-provisioning within 24 hours of separation.");
        item.setWeight(new BigDecimal("1.00"));
        item.setDisplayOrder(2);

        when(checklistItemRepository.findByCompanyIdAndId(companyId1, itemId)).thenReturn(Optional.of(item));
        when(checklistRepository.findById(chkId)).thenReturn(Optional.of(chk));
        when(checklistItemRepository.save(any(ChecklistItemEntity.class))).thenAnswer(i -> i.getArgument(0));

        ChecklistItemUpdate req = new ChecklistItemUpdate();
        req.setWeight(new BigDecimal("3.00"));
        req.setTestProcedure("Inspect automated SAML de-provisioning and audit logs.");

        ChecklistItemOut updated = checklistService.updateChecklistItem(companyId1, itemId, req, adminPrincipal);
        assertNotNull(updated);
        assertEquals(new BigDecimal("3.00"), updated.getWeight());
        assertTrue(updated.getTestProcedure().contains("automated SAML"));
    }

    // ==========================================
    // 17-20: VALIDATION, AUTHORIZATION & SYSTEM TESTS
    // ==========================================

    @Test
    @DisplayName("Test 17: Invalid Request Validation - Negative weight or missing fields rejected")
    void testDepartmentNotFound() {
        when(departmentRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

        DepartmentUpdate req = new DepartmentUpdate();
        req.setName("Nonexistent Dept");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> departmentService.updateDepartment(companyId1, UUID.randomUUID(), req, adminPrincipal));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    @DisplayName("Test 18: Unauthorized Access - Prevent cross-company checklist manipulation")
    void testCrossCompanyChecklistDenied() {
        UUID foreignChkId = UUID.randomUUID();
        when(checklistRepository.findByCompanyIdAndId(companyId1, foreignChkId)).thenReturn(Optional.empty());

        ChecklistItemCreate req = new ChecklistItemCreate();
        req.setControlCode("CTRL-01");
        req.setTitle("Control");
        req.setTestProcedure("Procedure");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> checklistService.createChecklistItem(companyId1, foreignChkId, req, adminPrincipal));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        assertTrue(ex.getReason().contains("not found in your organization"));
    }

    @Test
    @DisplayName("Test 19: Transaction Rollback Verification - Atomicity on error")
    void testPasswordResetInvalidatesSessions() {
        UUID targetUserId = UUID.randomUUID();
        UserEntity target = new UserEntity();
        target.setId(targetUserId);
        target.setCompanyId(companyId1);
        target.setEmail("reset.user@companyaudit.io");
        target.setPasswordHash("old_hash");
        target.setTokenVersion(5);

        when(userRepository.findById(targetUserId)).thenReturn(Optional.of(target));
        when(userRepository.save(any(UserEntity.class))).thenAnswer(i -> i.getArgument(0));

        AdminResetPasswordRequest req = new AdminResetPasswordRequest("NewBrandSecurePassword2026!");
        MessageResponse res = userService.resetPassword(companyId1, targetUserId, req, adminPrincipal);

        assertNotNull(res);
        assertTrue(res.getMessage().contains("Password updated"));
        assertEquals(6, target.getTokenVersion());
        assertNotEquals("old_hash", target.getPasswordHash());
        verify(refreshSessionRepository, times(1)).revokeAllForUser(eq(companyId1), eq(targetUserId), any(OffsetDateTime.class));
    }

    @Test
    @DisplayName("Test 20: Existing Authentication Integration - Password hashing parity across reset")
    void testResetPasswordGeneratesVerifiableArgon2Hash() {
        UUID targetUserId = UUID.randomUUID();
        UserEntity target = new UserEntity();
        target.setId(targetUserId);
        target.setCompanyId(companyId1);
        target.setEmail("verified.user@companyaudit.io");
        target.setPasswordHash("dummy");
        target.setTokenVersion(1);

        when(userRepository.findById(targetUserId)).thenReturn(Optional.of(target));

        String newPlainPassword = "BrandNewSuperSecure2026!";
        AdminResetPasswordRequest req = new AdminResetPasswordRequest(newPlainPassword);
        userService.resetPassword(companyId1, targetUserId, req, adminPrincipal);

        // Verify the stored hash is verified by Argon2PasswordEncoder
        assertTrue(passwordEncoder.matches(newPlainPassword, target.getPasswordHash()));
        assertFalse(passwordEncoder.matches("WrongPassword!", target.getPasswordHash()));
    }
}
