package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.RiskEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RiskRepository extends JpaRepository<RiskEntity, UUID>, JpaSpecificationExecutor<RiskEntity> {

    List<RiskEntity> findByCompanyIdOrderByInherentScoreDescCodeAsc(UUID companyId);

    Optional<RiskEntity> findByIdAndCompanyId(UUID id, UUID companyId);

    Optional<RiskEntity> findByCompanyIdAndCode(UUID companyId, String code);

    boolean existsByCompanyIdAndCode(UUID companyId, String code);

    List<RiskEntity> findByCompanyId(UUID companyId);
}
