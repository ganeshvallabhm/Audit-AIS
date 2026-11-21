package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.AuditResponseEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AuditResponseRepository extends JpaRepository<AuditResponseEntity, UUID> {

    List<AuditResponseEntity> findByAuditIdAndCompanyId(UUID auditId, UUID companyId);

    List<AuditResponseEntity> findByAuditId(UUID auditId);

    Optional<AuditResponseEntity> findByAuditIdAndChecklistItemId(UUID auditId, UUID checklistItemId);

    long countByAuditId(UUID auditId);

    long countByCompanyIdAndAuditId(UUID companyId, UUID auditId);
}
