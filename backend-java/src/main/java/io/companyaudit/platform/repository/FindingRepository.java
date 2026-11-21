package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.FindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FindingRepository extends JpaRepository<FindingEntity, UUID>, JpaSpecificationExecutor<FindingEntity> {

    long countByAuditIdAndStatusNot(UUID auditId, String status);

    List<FindingEntity> findByAuditIdAndCompanyId(UUID auditId, UUID companyId);

    List<FindingEntity> findByCompanyIdOrderByTargetSlaDateAsc(UUID companyId);

    Optional<FindingEntity> findByIdAndCompanyId(UUID id, UUID companyId);

    Optional<FindingEntity> findByCompanyIdAndCode(UUID companyId, String code);

    boolean existsByCompanyIdAndCode(UUID companyId, String code);

    List<FindingEntity> findByCompanyId(UUID companyId);
}
