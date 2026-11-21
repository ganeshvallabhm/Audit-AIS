package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.AuditScopeEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AuditScopeRepository extends JpaRepository<AuditScopeEntity, UUID> {

    List<AuditScopeEntity> findByAuditIdAndCompanyId(UUID auditId, UUID companyId);

    Optional<AuditScopeEntity> findByIdAndAuditIdAndCompanyId(UUID id, UUID auditId, UUID companyId);

    void deleteByIdAndAuditIdAndCompanyId(UUID id, UUID auditId, UUID companyId);
}
