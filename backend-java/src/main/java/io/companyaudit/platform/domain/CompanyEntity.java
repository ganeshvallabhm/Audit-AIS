package io.companyaudit.platform.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "companies")
public class CompanyEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "legal_name", nullable = false, length = 255)
    private String legalName;

    @Column(name = "ticker", length = 32)
    private String ticker;

    @Column(name = "headquarters", length = 255)
    private String headquarters;

    @Column(name = "fiscal_year_label", nullable = false, length = 64)
    private String fiscalYearLabel = "FY 2025 (Q4 Active)";

    @Column(name = "audit_committee_chair", length = 150)
    private String auditCommitteeChair;

    @Column(name = "external_auditor", length = 150)
    private String externalAuditor;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "regulatory_scope", columnDefinition = "jsonb", nullable = false)
    private List<String> regulatoryScope = new ArrayList<>();

    @Column(name = "enterprise_target_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal enterpriseTargetScore = new BigDecimal("85.00");

    @Column(name = "minimum_composite_floor", nullable = false, precision = 5, scale = 2)
    private BigDecimal minimumCompositeFloor = new BigDecimal("80.00");

    @Column(name = "board_risk_threshold", nullable = false)
    private Integer boardRiskThreshold = 5;

    @Column(name = "digest_frequency", nullable = false, length = 64)
    private String digestFrequency = "Weekly \u2014 Mondays 08:00 EST";

    @Column(name = "sla_auto_escalate", nullable = false)
    private Boolean slaAutoEscalate = true;

    @Column(name = "ai_citation_strict", nullable = false)
    private Boolean aiCitationStrict = true;

    @Column(name = "sha_lock_enabled", nullable = false)
    private Boolean shaLockEnabled = true;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @OneToMany(mappedBy = "company", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<UserEntity> users = new ArrayList<>();

    @OneToMany(mappedBy = "company", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<DepartmentEntity> departments = new ArrayList<>();

    public CompanyEntity() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getLegalName() {
        return legalName;
    }

    public void setLegalName(String legalName) {
        this.legalName = legalName;
    }

    public String getTicker() {
        return ticker;
    }

    public void setTicker(String ticker) {
        this.ticker = ticker;
    }

    public String getHeadquarters() {
        return headquarters;
    }

    public void setHeadquarters(String headquarters) {
        this.headquarters = headquarters;
    }

    public String getFiscalYearLabel() {
        return fiscalYearLabel;
    }

    public void setFiscalYearLabel(String fiscalYearLabel) {
        this.fiscalYearLabel = fiscalYearLabel;
    }

    public String getAuditCommitteeChair() {
        return auditCommitteeChair;
    }

    public void setAuditCommitteeChair(String auditCommitteeChair) {
        this.auditCommitteeChair = auditCommitteeChair;
    }

    public String getExternalAuditor() {
        return externalAuditor;
    }

    public void setExternalAuditor(String externalAuditor) {
        this.externalAuditor = externalAuditor;
    }

    public List<String> getRegulatoryScope() {
        return regulatoryScope;
    }

    public void setRegulatoryScope(List<String> regulatoryScope) {
        this.regulatoryScope = regulatoryScope;
    }

    public BigDecimal getEnterpriseTargetScore() {
        return enterpriseTargetScore;
    }

    public void setEnterpriseTargetScore(BigDecimal enterpriseTargetScore) {
        this.enterpriseTargetScore = enterpriseTargetScore;
    }

    public BigDecimal getMinimumCompositeFloor() {
        return minimumCompositeFloor;
    }

    public void setMinimumCompositeFloor(BigDecimal minimumCompositeFloor) {
        this.minimumCompositeFloor = minimumCompositeFloor;
    }

    public Integer getBoardRiskThreshold() {
        return boardRiskThreshold;
    }

    public void setBoardRiskThreshold(Integer boardRiskThreshold) {
        this.boardRiskThreshold = boardRiskThreshold;
    }

    public String getDigestFrequency() {
        return digestFrequency;
    }

    public void setDigestFrequency(String digestFrequency) {
        this.digestFrequency = digestFrequency;
    }

    public Boolean getSlaAutoEscalate() {
        return slaAutoEscalate;
    }

    public void setSlaAutoEscalate(Boolean slaAutoEscalate) {
        this.slaAutoEscalate = slaAutoEscalate;
    }

    public Boolean getAiCitationStrict() {
        return aiCitationStrict;
    }

    public void setAiCitationStrict(Boolean aiCitationStrict) {
        this.aiCitationStrict = aiCitationStrict;
    }

    public Boolean getShaLockEnabled() {
        return shaLockEnabled;
    }

    public void setShaLockEnabled(Boolean shaLockEnabled) {
        this.shaLockEnabled = shaLockEnabled;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean active) {
        isActive = active;
    }

    public List<UserEntity> getUsers() {
        return users;
    }

    public void setUsers(List<UserEntity> users) {
        this.users = users;
    }

    public List<DepartmentEntity> getDepartments() {
        return departments;
    }

    public void setDepartments(List<DepartmentEntity> departments) {
        this.departments = departments;
    }
}
