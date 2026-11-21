package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.RecommendationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RecommendationRepository extends JpaRepository<RecommendationEntity, UUID> {

    List<RecommendationEntity> findByCompanyIdAndFindingIdOrderByCreatedAtAsc(UUID companyId, UUID findingId);

    Optional<RecommendationEntity> findByIdAndCompanyId(UUID id, UUID companyId);
}
