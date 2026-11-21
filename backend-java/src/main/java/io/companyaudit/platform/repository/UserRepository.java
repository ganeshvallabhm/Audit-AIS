package io.companyaudit.platform.repository;

import io.companyaudit.platform.domain.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<UserEntity, UUID> {

    @Query("SELECT u FROM UserEntity u WHERE LOWER(u.email) = LOWER(:email)")
    Optional<UserEntity> findByEmailIgnoreCase(@Param("email") String email);

    @Query("SELECT u FROM UserEntity u WHERE u.companyId = :companyId AND LOWER(u.email) = LOWER(:email)")
    Optional<UserEntity> findByCompanyIdAndEmailIgnoreCase(@Param("companyId") UUID companyId, @Param("email") String email);

    List<UserEntity> findAllByCompanyId(UUID companyId);

    List<UserEntity> findAllByCompanyIdAndDepartmentId(UUID companyId, UUID departmentId);
}
