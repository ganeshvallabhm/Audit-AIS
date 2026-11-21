package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public class CompanyCreateRequest {

    @NotBlank(message = "Legal name is required")
    @Size(min = 2, max = 255)
    @JsonProperty("legal_name")
    private String legalName;

    @Size(max = 32)
    private String ticker;

    @Size(max = 255)
    private String headquarters;

    @Size(min = 2, max = 64)
    @JsonProperty("fiscal_year_label")
    private String fiscalYearLabel = "FY 2025 (Q4 Active)";

    @JsonProperty("regulatory_scope")
    private List<String> regulatoryScope = new ArrayList<>();

    @DecimalMin("0.00")
    @DecimalMax("100.00")
    @JsonProperty("enterprise_target_score")
    private BigDecimal enterpriseTargetScore = new BigDecimal("85.00");

    @DecimalMin("0.00")
    @DecimalMax("100.00")
    @JsonProperty("minimum_composite_floor")
    private BigDecimal minimumCompositeFloor = new BigDecimal("80.00");

    @Min(1)
    @Max(50)
    @JsonProperty("board_risk_threshold")
    private Integer boardRiskThreshold = 5;

    public CompanyCreateRequest() {}

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
}
