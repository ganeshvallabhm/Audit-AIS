package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.UUID;

public class DepartmentCreate {

    @NotBlank(message = "Department code is required")
    @Size(min = 2, max = 32)
    @Pattern(regexp = "^[A-Za-z0-9\\-_]+$", message = "Department code must be alphanumeric with hyphens or underscores")
    private String code;

    @NotBlank(message = "Department name is required")
    @Size(min = 2, max = 150)
    private String name;

    @JsonProperty("head_user_id")
    private UUID headUserId;

    @DecimalMin("0.00")
    @DecimalMax("100.00")
    @JsonProperty("target_score")
    private BigDecimal targetScore = new BigDecimal("85.00");

    @DecimalMin(value = "0.0001", inclusive = true)
    @DecimalMax(value = "1.0000", inclusive = true)
    @JsonProperty("scoring_weight")
    private BigDecimal scoringWeight = new BigDecimal("0.1250");

    @JsonProperty("attention_note")
    private String attentionNote;

    public DepartmentCreate() {}

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
