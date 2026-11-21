package io.companyaudit.platform.domain;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "audit_scopes", indexes = {
        @Index(name = "ix_audit_scopes_audit", columnList = "company_id, audit_id")
})
public class AuditScopeEntity extends BaseTimestampEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "audit_id", nullable = false)
    private UUID auditId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "audit_id", insertable = false, updatable = false)
    private AuditEntity audit;

    @Column(name = "scope_name", nullable = false, length = 180)
    private String scopeName;

    @Column(name = "system_or_process", nullable = false, length = 180)
    private String systemOrProcess;

    @Column(name = "regulatory_clause", length = 120)
    private String regulatoryClause;

    @Column(name = "in_scope", nullable = false)
    private Boolean inScope = true;

    public AuditScopeEntity() {}

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

    public UUID getAuditId() {
        return auditId;
    }

    public void setAuditId(UUID auditId) {
        this.auditId = auditId;
    }

    public AuditEntity getAudit() {
        return audit;
    }

    public void setAudit(AuditEntity audit) {
        this.audit = audit;
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
