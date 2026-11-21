package io.companyaudit.platform.domain;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "departments", uniqueConstraints = {
        @UniqueConstraint(name = "uq_departments_company_code", columnNames = {"company_id", "code"})
})
public class DepartmentEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", insertable = false, updatable = false)
    private CompanyEntity company;

    @Column(name = "head_user_id")
    private UUID headUserId;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "target_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal targetScore = new BigDecimal("85.00");

    @Column(name = "scoring_weight", nullable = false, precision = 5, scale = 4)
    private BigDecimal scoringWeight = new BigDecimal("0.1250");

    @Column(name = "attention_note", columnDefinition = "TEXT")
    private String attentionNote;

    public DepartmentEntity() {}

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

    public CompanyEntity getCompany() {
        return company;
    }

    public void setCompany(CompanyEntity company) {
        this.company = company;
    }

    public UUID getHeadUserId() {
        return headUserId;
    }

    public void setHeadUserId(UUID headUserId) {
        this.headUserId = headUserId;
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
}
