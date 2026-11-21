package io.companyaudit.platform.service;

import io.companyaudit.platform.domain.AuditEntity;
import io.companyaudit.platform.domain.AuditResponseEntity;
import io.companyaudit.platform.dto.response.AuditStageOut;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Service
public class AuditScoringService {

    public static final Map<String, BigDecimal> RESPONSE_SCORE_MAP = Map.of(
            "Pass", new BigDecimal("1.00"),
            "Partial", new BigDecimal("0.50"),
            "Fail", new BigDecimal("0.00")
    );

    public static final Map<String, List<String>> ALLOWED_AUDIT_TRANSITIONS = Map.of(
            "Draft", List.of("Scheduled"),
            "Scheduled", List.of("In Progress", "Draft"),
            "In Progress", List.of("Review"),
            "Review", List.of("Action Required", "Verification"),
            "Action Required", List.of("Verification", "Review"),
            "Verification", List.of("Closed", "Review"),
            "Closed", List.of()
    );

    /**
     * Normalizes and maps response value to score factor (Pass=1.0, Partial=0.5, Fail=0.0, N/A=null).
     */
    public BigDecimal responseValueToFactor(String responseValue) {
        if (responseValue == null) {
            throw new IllegalArgumentException("Response value cannot be null");
        }
        String normalized = normalizeResponseValue(responseValue);
        if ("N/A".equals(normalized)) {
            return null;
        }
        BigDecimal factor = RESPONSE_SCORE_MAP.get(normalized);
        if (factor == null) {
            throw new IllegalArgumentException("Unsupported response_value '" + responseValue + "'.");
        }
        return factor;
    }

    /**
     * Normalizes input strings (e.g. "pass", "PASS", "Pass", "NOT_APPLICABLE", "N/A")
     * to the standard Python / DB format: 'Pass', 'Partial', 'Fail', 'N/A'.
     */
    public String normalizeResponseValue(String responseValue) {
        if (responseValue == null) return "N/A";
        String trimmed = responseValue.trim();
        if (trimmed.equalsIgnoreCase("Pass")) return "Pass";
        if (trimmed.equalsIgnoreCase("Partial")) return "Partial";
        if (trimmed.equalsIgnoreCase("Fail")) return "Fail";
        if (trimmed.equalsIgnoreCase("N/A") || trimmed.equalsIgnoreCase("NOT_APPLICABLE") || trimmed.equalsIgnoreCase("NA")) {
            return "N/A";
        }
        throw new IllegalArgumentException("Unsupported response_value '" + responseValue + "'.");
    }

    /**
     * Recalculates weighted audit score from persisted responses.
     * N/A is excluded from numerator and denominator.
     * Returns computed percentage rounded to 2 decimal places, or null if applicable weight <= 0.
     */
    public ScoreResult calculateScore(List<AuditResponseEntity> responses) {
        if (responses == null || responses.isEmpty()) {
            return new ScoreResult(null, 0, 0);
        }

        int totalResponses = responses.size();
        BigDecimal earnedPoints = BigDecimal.ZERO;
        BigDecimal applicableWeight = BigDecimal.ZERO;
        int evaluatedCount = 0;

        for (AuditResponseEntity response : responses) {
            String value = normalizeResponseValue(response.getResponseValue());
            if ("N/A".equals(value) || response.getScoreFactor() == null) {
                continue;
            }
            BigDecimal weight = (response.getChecklistItem() != null && response.getChecklistItem().getWeight() != null)
                    ? response.getChecklistItem().getWeight()
                    : BigDecimal.ONE;

            BigDecimal factor = response.getScoreFactor();
            earnedPoints = earnedPoints.add(factor.multiply(weight));
            applicableWeight = applicableWeight.add(weight);
            evaluatedCount++;
        }

        if (applicableWeight.compareTo(BigDecimal.ZERO) <= 0) {
            return new ScoreResult(null, totalResponses, 0);
        }

        BigDecimal pct = earnedPoints.divide(applicableWeight, 6, RoundingMode.HALF_UP)
                .multiply(new BigDecimal("100"))
                .setScale(2, RoundingMode.HALF_UP);

        return new ScoreResult(pct.doubleValue(), totalResponses, evaluatedCount);
    }

    /**
     * Validates status transition against the allowed state machine.
     */
    public void validateAuditStatusTransition(AuditEntity audit, String targetStatus, long openFindingsCount) {
        if (targetStatus == null || targetStatus.equals(audit.getStatus())) {
            return;
        }

        List<String> allowed = ALLOWED_AUDIT_TRANSITIONS.getOrDefault(audit.getStatus(), Collections.emptyList());
        if (!allowed.contains(targetStatus)) {
            throw new IllegalArgumentException(
                    "Invalid audit status transition from '" + audit.getStatus() + "' to '" + targetStatus + "'. " +
                    "Allowed next states: " + allowed + "."
            );
        }

        if ("Verification".equals(targetStatus) || "Closed".equals(targetStatus)) {
            if (openFindingsCount > 0) {
                if ("Review".equals(audit.getStatus()) && "Verification".equals(targetStatus)) {
                    throw new IllegalArgumentException("Cannot skip 'Action Required' when open findings exist on this audit.");
                }
                if ("Closed".equals(targetStatus)) {
                    throw new IllegalArgumentException("Cannot close audit while unresolved findings remain open.");
                }
            }
        }
    }

    /**
     * Computes the 4 audit workflow stages matching Python's compute_audit_stages.
     */
    public List<AuditStageOut> computeAuditStages(String statusValue, int controlsEvaluated, int controlsTotal) {
        int testingPct = 0;
        if (controlsTotal > 0) {
            testingPct = Math.min(100, Math.round(((float) controlsEvaluated / controlsTotal) * 100));
        }

        if ("Draft".equals(statusValue)) {
            return List.of(
                    new AuditStageOut("Scope Defined", 30, "active"),
                    new AuditStageOut("Evidence Gathering", 0, "pending"),
                    new AuditStageOut("Review & Testing", 0, "pending"),
                    new AuditStageOut("Final Sign-off", 0, "pending")
            );
        }
        if ("Scheduled".equals(statusValue)) {
            return List.of(
                    new AuditStageOut("Scope Defined", 100, "completed"),
                    new AuditStageOut("Evidence Gathering", 0, "pending"),
                    new AuditStageOut("Review & Testing", 0, "pending"),
                    new AuditStageOut("Final Sign-off", 0, "pending")
            );
        }
        if ("In Progress".equals(statusValue)) {
            return List.of(
                    new AuditStageOut("Scope Defined", 100, "completed"),
                    new AuditStageOut("Evidence Gathering", 100, "completed"),
                    new AuditStageOut("Review & Testing", Math.max(20, testingPct), "active"),
                    new AuditStageOut("Final Sign-off", 0, "pending")
            );
        }
        if ("Review".equals(statusValue) || "Action Required".equals(statusValue)) {
            return List.of(
                    new AuditStageOut("Scope Defined", 100, "completed"),
                    new AuditStageOut("Evidence Gathering", 100, "completed"),
                    new AuditStageOut("Review & Testing", Math.max(75, testingPct), "active"),
                    new AuditStageOut("Final Sign-off", "Review".equals(statusValue) ? 25 : 10, "pending")
            );
        }
        if ("Verification".equals(statusValue)) {
            return List.of(
                    new AuditStageOut("Scope Defined", 100, "completed"),
                    new AuditStageOut("Evidence Gathering", 100, "completed"),
                    new AuditStageOut("Review & Testing", 100, "completed"),
                    new AuditStageOut("Final Sign-off", 65, "active")
            );
        }
        // Closed
        return List.of(
                new AuditStageOut("Scope Defined", 100, "completed"),
                new AuditStageOut("Evidence Gathering", 100, "completed"),
                new AuditStageOut("Review & Testing", 100, "completed"),
                new AuditStageOut("Final Sign-off", 100, "completed")
        );
    }

    public static class ScoreResult {
        private final Double score;
        private final int totalResponses;
        private final int evaluatedCount;

        public ScoreResult(Double score, int totalResponses, int evaluatedCount) {
            this.score = score;
            this.totalResponses = totalResponses;
            this.evaluatedCount = evaluatedCount;
        }

        public Double getScore() {
            return score;
        }

        public int getTotalResponses() {
            return totalResponses;
        }

        public int getEvaluatedCount() {
            return evaluatedCount;
        }
    }
}
