package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.ChecklistEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ChecklistRepository extends JpaRepository<ChecklistEntity, UUID> {

    List<ChecklistEntity> findAllByCompanyIdAndIsActiveTrueOrderByDomainAscCodeAsc(UUID companyId);

    List<ChecklistEntity> findAllByCompanyIdAndDomainAndIsActiveTrueOrderByCodeAsc(UUID companyId, String domain);

    Optional<ChecklistEntity> findByCompanyIdAndCode(UUID companyId, String code);

    Optional<ChecklistEntity> findByCompanyIdAndId(UUID companyId, UUID id);
}
