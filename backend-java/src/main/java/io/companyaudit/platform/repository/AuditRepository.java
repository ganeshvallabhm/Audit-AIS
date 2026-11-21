package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.AuditEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AuditRepository extends JpaRepository<AuditEntity, UUID>, JpaSpecificationExecutor<AuditEntity> {

    Optional<AuditEntity> findByIdAndCompanyId(UUID id, UUID companyId);

    Optional<AuditEntity> findByCompanyIdAndCode(UUID companyId, String code);

    boolean existsByCompanyIdAndCode(UUID companyId, String code);

    List<AuditEntity> findByCompanyIdOrderByCreatedAtDesc(UUID companyId);

    Page<AuditEntity> findByCompanyId(UUID companyId, Pageable pageable);

    long countByCompanyIdAndDomain(UUID companyId, String domain);

    List<AuditEntity> findByCompanyId(UUID companyId);
}
