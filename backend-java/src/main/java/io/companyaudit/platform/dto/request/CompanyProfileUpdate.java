package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;

public class CompanyProfileUpdate {

    @Size(min = 2, max = 255)
    @JsonProperty("legal_name")
    private String legalName;

    @Size(max = 32)
    private String ticker;

    @Size(max = 255)
    private String headquarters;

    @Size(min = 2, max = 64)
    @JsonProperty("fiscal_year_label")
    private String fiscalYearLabel;

    @Size(max = 150)
    @JsonProperty("audit_committee_chair")
    private String auditCommitteeChair;

    @Size(max = 150)
    @JsonProperty("external_auditor")
    private String externalAuditor;

    @JsonProperty("regulatory_scope")
    private List<String> regulatoryScope;

    @DecimalMin("0.00")
    @DecimalMax("100.00")
    @JsonProperty("enterprise_target_score")
    private BigDecimal enterpriseTargetScore;

    @DecimalMin("0.00")
    @DecimalMax("100.00")
    @JsonProperty("minimum_composite_floor")
    private BigDecimal minimumCompositeFloor;

    @Min(1)
    @Max(50)
    @JsonProperty("board_risk_threshold")
    private Integer boardRiskThreshold;

    @Size(max = 64)
    @JsonProperty("digest_frequency")
    private String digestFrequency;

    @JsonProperty("sla_auto_escalate")
    private Boolean slaAutoEscalate;

    @JsonProperty("ai_citation_strict")
    private Boolean aiCitationStrict;

    @JsonProperty("sha_lock_enabled")
    private Boolean shaLockEnabled;

    public CompanyProfileUpdate() {}

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
}
