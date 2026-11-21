package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class CompanyProfileOut {

    private UUID id;

    @JsonProperty("legal_name")
    private String legalName;

    private String ticker;

    private String headquarters;

    @JsonProperty("fiscal_year_label")
    private String fiscalYearLabel;

    @JsonProperty("audit_committee_chair")
    private String auditCommitteeChair;

    @JsonProperty("external_auditor")
    private String externalAuditor;

    @JsonProperty("regulatory_scope")
    private List<String> regulatoryScope = new ArrayList<>();

    @JsonProperty("enterprise_target_score")
    private BigDecimal enterpriseTargetScore;

    @JsonProperty("minimum_composite_floor")
    private BigDecimal minimumCompositeFloor;

    @JsonProperty("board_risk_threshold")
    private Integer boardRiskThreshold;

    @JsonProperty("digest_frequency")
    private String digestFrequency;

    @JsonProperty("sla_auto_escalate")
    private Boolean slaAutoEscalate;

    @JsonProperty("ai_citation_strict")
    private Boolean aiCitationStrict;

    @JsonProperty("sha_lock_enabled")
    private Boolean shaLockEnabled = true;

    @JsonProperty("is_active")
    private Boolean isActive;

    @JsonProperty("created_at")
    private OffsetDateTime createdAt;

    @JsonProperty("updated_at")
    private OffsetDateTime updatedAt;

    public CompanyProfileOut() {}

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

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
