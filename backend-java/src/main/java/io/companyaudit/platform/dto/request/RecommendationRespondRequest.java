package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class RecommendationRespondRequest {

    @NotBlank
    @Size(min = 3, max = 4000)
    @JsonProperty("management_response")
    private String managementResponse;

    @JsonProperty("accepted_by_management")
    private Boolean acceptedByManagement = true;

    public RecommendationRespondRequest() {}

    public String getManagementResponse() {
        return managementResponse;
    }

    public void setManagementResponse(String managementResponse) {
        this.managementResponse = managementResponse;
    }

    public Boolean getAcceptedByManagement() {
        return acceptedByManagement;
    }

    public void setAcceptedByManagement(Boolean acceptedByManagement) {
        this.acceptedByManagement = acceptedByManagement;
    }
}
