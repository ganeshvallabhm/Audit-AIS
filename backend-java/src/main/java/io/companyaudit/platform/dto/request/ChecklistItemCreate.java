package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public class ChecklistItemCreate {

    @NotBlank(message = "Control code is required")
    @Size(min = 2, max = 40)
    @JsonProperty("control_code")
    private String controlCode;

    @NotBlank(message = "Title is required")
    @Size(min = 3, max = 255)
    private String title;

    @NotBlank(message = "Test procedure is required")
    @Size(min = 5)
    @JsonProperty("test_procedure")
    private String testProcedure;

    @DecimalMin(value = "0.01", inclusive = true)
    @DecimalMax(value = "10.00", inclusive = true)
    private BigDecimal weight = new BigDecimal("1.00");

    @Min(1)
    @JsonProperty("display_order")
    private int displayOrder = 1;

    public ChecklistItemCreate() {}

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

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
