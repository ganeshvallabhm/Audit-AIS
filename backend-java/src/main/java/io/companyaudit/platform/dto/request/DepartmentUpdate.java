package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

public class DepartmentUpdate {

    @Size(min = 2, max = 150)
    private String name;

    @JsonProperty("head_user_id")
    private UUID headUserId;

    @DecimalMin("0.00")
    @DecimalMax("100.00")
    @JsonProperty("target_score")
    private BigDecimal targetScore;

    @DecimalMin(value = "0.0001", inclusive = true)
    @DecimalMax(value = "1.0000", inclusive = true)
    @JsonProperty("scoring_weight")
    private BigDecimal scoringWeight;

    @JsonProperty("attention_note")
    private String attentionNote;

    public DepartmentUpdate() {}

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public UUID getHeadUserId() {
        return headUserId;
    }

    public void setHeadUserId(UUID headUserId) {
        this.headUserId = headUserId;
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
}
