package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public class ChecklistItemUpdate {

    @Size(min = 3, max = 255)
    private String title;

    @Size(min = 5)
    @JsonProperty("test_procedure")
    private String testProcedure;

    @DecimalMin(value = "0.01", inclusive = true)
    @DecimalMax(value = "10.00", inclusive = true)
    private BigDecimal weight;

    @Min(1)
    @JsonProperty("display_order")
    private Integer displayOrder;

    public ChecklistItemUpdate() {}

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
