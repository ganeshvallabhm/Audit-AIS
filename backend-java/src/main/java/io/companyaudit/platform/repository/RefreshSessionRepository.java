package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.RefreshSessionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RefreshSessionRepository extends JpaRepository<RefreshSessionEntity, UUID> {

    Optional<RefreshSessionEntity> findByTokenHash(String tokenHash);

    List<RefreshSessionEntity> findAllByTokenFamily(UUID tokenFamily);

    @Modifying
    @Query("UPDATE RefreshSessionEntity r SET r.revokedAt = :revokedAt WHERE r.tokenFamily = :tokenFamily AND r.revokedAt IS NULL")
    int revokeAllInFamily(@Param("tokenFamily") UUID tokenFamily, @Param("revokedAt") OffsetDateTime revokedAt);

    @Modifying
    @Query("UPDATE RefreshSessionEntity r SET r.revokedAt = :revokedAt WHERE r.companyId = :companyId AND r.userId = :userId AND r.revokedAt IS NULL")
    int revokeAllForUser(@Param("companyId") UUID companyId, @Param("userId") UUID userId, @Param("revokedAt") OffsetDateTime revokedAt);
}
