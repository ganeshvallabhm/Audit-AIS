package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.EvidenceEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EvidenceRepository extends JpaRepository<EvidenceEntity, UUID>, JpaSpecificationExecutor<EvidenceEntity> {

    List<EvidenceEntity> findByCompanyIdOrderByCreatedAtDesc(UUID companyId);

    List<EvidenceEntity> findByCompanyIdAndAuditId(UUID companyId, UUID auditId);

    List<EvidenceEntity> findByCompanyIdAndFindingId(UUID companyId, UUID findingId);

    List<EvidenceEntity> findByFindingIdInOrderByCreatedAtDesc(List<UUID> findingIds);

    Optional<EvidenceEntity> findByIdAndCompanyId(UUID id, UUID companyId);

    Optional<EvidenceEntity> findByCompanyIdAndCode(UUID companyId, String code);

    boolean existsByCompanyIdAndCode(UUID companyId, String code);

    Optional<EvidenceEntity> findByStorageKey(String storageKey);
}
