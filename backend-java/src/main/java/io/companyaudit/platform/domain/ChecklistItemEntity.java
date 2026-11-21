package io.companyaudit.platform.domain;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "checklist_items", uniqueConstraints = {
        @UniqueConstraint(name = "uq_checklist_items_code", columnNames = {"checklist_id", "control_code"})
}, indexes = {
        @Index(name = "ix_checklist_items_checklist", columnList = "company_id, checklist_id")
})
public class ChecklistItemEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "checklist_id", nullable = false)
    private UUID checklistId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "checklist_id", insertable = false, updatable = false)
    private ChecklistEntity checklist;

    @Column(name = "control_code", nullable = false, length = 40)
    private String controlCode;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "test_procedure", nullable = false, columnDefinition = "TEXT")
    private String testProcedure;

    @Column(name = "weight", nullable = false, precision = 6, scale = 2)
    private BigDecimal weight = new BigDecimal("1.00");

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder = 1;

    public ChecklistItemEntity() {}

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

    public UUID getChecklistId() {
        return checklistId;
    }

    public void setChecklistId(UUID checklistId) {
        this.checklistId = checklistId;
    }

    public ChecklistEntity getChecklist() {
        return checklist;
    }

    public void setChecklist(ChecklistEntity checklist) {
        this.checklist = checklist;
    }

    public String getControlCode() {
        return controlCode;
    }

    public void setControlCode(String controlCode) {
        this.controlCode = controlCode;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getTestProcedure() {
        return testProcedure;
    }

    public void setTestProcedure(String testProcedure) {
        this.testProcedure = testProcedure;
    }

    public BigDecimal getWeight() {
        return weight;
    }

    public void setWeight(BigDecimal weight) {
        this.weight = weight;
    }

    public Integer getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(Integer displayOrder) {
        this.displayOrder = displayOrder;
    }
}
