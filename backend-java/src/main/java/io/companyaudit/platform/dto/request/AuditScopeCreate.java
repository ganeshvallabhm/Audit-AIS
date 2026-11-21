package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class AuditScopeCreate {

    @NotBlank
    @Size(min = 2, max = 180)
    @JsonProperty("scope_name")
    private String scopeName;

    @NotBlank
    @Size(min = 2, max = 180)
    @JsonProperty("system_or_process")
    private String systemOrProcess;

    @Size(max = 120)
    @JsonProperty("regulatory_clause")
    private String regulatoryClause;

    @JsonProperty("in_scope")
    private Boolean inScope = true;

    public AuditScopeCreate() {}

    public AuditScopeCreate(String scopeName, String systemOrProcess, String regulatoryClause, Boolean inScope) {
        this.scopeName = scopeName;
        this.systemOrProcess = systemOrProcess;
        this.regulatoryClause = regulatoryClause;
        this.inScope = inScope != null ? inScope : true;
    }

    public String getScopeName() {
        return scopeName;
    }

    public void setScopeName(String scopeName) {
        this.scopeName = scopeName;
    }

    public String getSystemOrProcess() {
        return systemOrProcess;
    }

    public void setSystemOrProcess(String systemOrProcess) {
        this.systemOrProcess = systemOrProcess;
    }

    public String getRegulatoryClause() {
        return regulatoryClause;
    }

    public void setRegulatoryClause(String regulatoryClause) {
        this.regulatoryClause = regulatoryClause;
    }

    public Boolean getInScope() {
        return inScope;
    }

    public void setInScope(Boolean inScope) {
        this.inScope = inScope;
    }
}
