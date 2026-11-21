package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.UUID;

public class AuditScopeOut {

    private UUID id;

    @JsonProperty("audit_id")
    private UUID auditId;

    @JsonProperty("scope_name")
    private String scopeName;

    @JsonProperty("system_or_process")
    private String systemOrProcess;

    @JsonProperty("regulatory_clause")
    private String regulatoryClause;

    @JsonProperty("in_scope")
    private Boolean inScope;

    public AuditScopeOut() {}

    public AuditScopeOut(UUID id, UUID auditId, String scopeName, String systemOrProcess, String regulatoryClause, Boolean inScope) {
        this.id = id;
        this.auditId = auditId;
        this.scopeName = scopeName;
        this.systemOrProcess = systemOrProcess;
        this.regulatoryClause = regulatoryClause;
        this.inScope = inScope;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getAuditId() {
        return auditId;
    }

    public void setAuditId(UUID auditId) {
        this.auditId = auditId;
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
