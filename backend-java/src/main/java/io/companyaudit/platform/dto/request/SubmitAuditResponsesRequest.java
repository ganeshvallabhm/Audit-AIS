package io.companyaudit.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.ArrayList;
import java.util.List;

public class SubmitAuditResponsesRequest {

    @NotEmpty
    @Valid
    private List<AuditResponseItemInput> responses = new ArrayList<>();

    public SubmitAuditResponsesRequest() {}

    public SubmitAuditResponsesRequest(List<AuditResponseItemInput> responses) {
        this.responses = responses;
    }

    public List<AuditResponseItemInput> getResponses() {
        return responses;
    }

    public void setResponses(List<AuditResponseItemInput> responses) {
        this.responses = responses;
    }
}
