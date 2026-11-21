package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.DepartmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Repository
public interface DepartmentRepository extends JpaRepository<DepartmentEntity, UUID> {

    List<DepartmentEntity> findAllByCompanyId(UUID companyId);

    Optional<DepartmentEntity> findByCompanyIdAndCode(UUID companyId, String code);

    List<DepartmentEntity> findByIdIn(Set<UUID> ids);
}
