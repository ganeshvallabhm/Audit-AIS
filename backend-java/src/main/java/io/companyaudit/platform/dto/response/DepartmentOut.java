package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public class DepartmentOut {

    private UUID id;

    @JsonProperty("company_id")
    private UUID companyId;

    @JsonProperty("head_user_id")
    private UUID headUserId;

    @JsonProperty("head_name")
    private String headName;

    private String code;

    private String name;

    @JsonProperty("target_score")
    private BigDecimal targetScore;

    @JsonProperty("scoring_weight")
    private BigDecimal scoringWeight;

    @JsonProperty("attention_note")
    private String attentionNote;

    private BigDecimal score;

    @JsonProperty("active_audits")
    private int activeAudits = 0;

    @JsonProperty("open_findings")
    private int openFindings = 0;

    @JsonProperty("risk_count")
    private int riskCount = 0;

    @JsonProperty("attention_area")
    private boolean attentionArea = false;

    @JsonProperty("created_at")
    private OffsetDateTime createdAt;

    @JsonProperty("updated_at")
    private OffsetDateTime updatedAt;

    public DepartmentOut() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public void setCompanyId(UUID companyId) {
        this.companyId = companyId;
    }

    public UUID getHeadUserId() {
        return headUserId;
    }

    public void setHeadUserId(UUID headUserId) {
        this.headUserId = headUserId;
    }

    public String getHeadName() {
        return headName;
    }

    public void setHeadName(String headName) {
        this.headName = headName;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public BigDecimal getTargetScore() {
        return targetScore;
    }

    public void setTargetScore(BigDecimal targetScore) {
        this.targetScore = targetScore;
    }

    public BigDecimal getScoringWeight() {
        return scoringWeight;
    }

    public void setScoringWeight(BigDecimal scoringWeight) {
        this.scoringWeight = scoringWeight;
    }

    public String getAttentionNote() {
        return attentionNote;
    }

    public void setAttentionNote(String attentionNote) {
        this.attentionNote = attentionNote;
    }

    public BigDecimal getScore() {
        return score;
    }

    public void setScore(BigDecimal score) {
        this.score = score;
    }

    public int getActiveAudits() {
        return activeAudits;
    }

    public void setActiveAudits(int activeAudits) {
        this.activeAudits = activeAudits;
    }

    public int getOpenFindings() {
        return openFindings;
    }

    public void setOpenFindings(int openFindings) {
        this.openFindings = openFindings;
    }

    public int getRiskCount() {
        return riskCount;
    }

    public void setRiskCount(int riskCount) {
        this.riskCount = riskCount;
    }

    public boolean isAttentionArea() {
        return attentionArea;
    }

    public void setAttentionArea(boolean attentionArea) {
        this.attentionArea = attentionArea;
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
