package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.AuditHistoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AuditHistoryRepository extends JpaRepository<AuditHistoryEntity, UUID> {

    Optional<AuditHistoryEntity> findTopByCompanyIdOrderByCreatedAtDesc(UUID companyId);

    List<AuditHistoryEntity> findByCompanyIdOrderByCreatedAtAscIdAsc(UUID companyId);

    List<AuditHistoryEntity> findByCompanyIdOrderByCreatedAtAsc(UUID companyId);

    long countByCompanyId(UUID companyId);
}
