package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.ChecklistItemEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ChecklistItemRepository extends JpaRepository<ChecklistItemEntity, UUID> {

    List<ChecklistItemEntity> findAllByChecklistIdOrderByDisplayOrderAsc(UUID checklistId);

    Optional<ChecklistItemEntity> findByChecklistIdAndControlCode(UUID checklistId, String controlCode);

    Optional<ChecklistItemEntity> findByCompanyIdAndId(UUID companyId, UUID id);
}
