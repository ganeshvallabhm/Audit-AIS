package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.CorrectiveActionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CorrectiveActionRepository extends JpaRepository<CorrectiveActionEntity, UUID>, JpaSpecificationExecutor<CorrectiveActionEntity> {

    List<CorrectiveActionEntity> findByCompanyIdOrderByDueDateAscStepOrderAsc(UUID companyId);

    List<CorrectiveActionEntity> findByCompanyIdAndFindingIdOrderByStepOrderAsc(UUID companyId, UUID findingId);

    List<CorrectiveActionEntity> findByCompanyIdAndRiskIdOrderByStepOrderAsc(UUID companyId, UUID riskId);

    List<CorrectiveActionEntity> findByFindingIdIn(List<UUID> findingIds);

    List<CorrectiveActionEntity> findByRiskIdIn(List<UUID> riskIds);

    Optional<CorrectiveActionEntity> findByIdAndCompanyId(UUID id, UUID companyId);

    Optional<CorrectiveActionEntity> findByCompanyIdAndCode(UUID companyId, String code);

    boolean existsByCompanyIdAndCode(UUID companyId, String code);
}
