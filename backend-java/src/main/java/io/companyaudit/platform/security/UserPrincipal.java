package io.companyaudit.platform.security;

import io.companyaudit.platform.domain.UserEntity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.Collections;
import java.util.UUID;

public class UserPrincipal implements UserDetails {

    private final UUID id;
    private final UUID companyId;
    private final UUID departmentId;
    private final String email;
    private final String password;
    private final String role;
    private final int tokenVersion;
    private final boolean active;
    private final Collection<? extends GrantedAuthority> authorities;

    public UserPrincipal(UUID id, UUID companyId, UUID departmentId, String email, String password,
                         String role, int tokenVersion, boolean active) {
        this.id = id;
        this.companyId = companyId;
        this.departmentId = departmentId;
        this.email = email;
        this.password = password;
        this.role = role;
        this.tokenVersion = tokenVersion;
        this.active = active;
        // Standard Spring Security role format: "ROLE_Admin", "ROLE_Department Head", etc.
        this.authorities = Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.replace(" ", "_")));
    }

    public static UserPrincipal create(UserEntity user) {
        return new UserPrincipal(
                user.getId(),
                user.getCompanyId(),
                user.getDepartmentId(),
                user.getEmail(),
                user.getPasswordHash(),
                user.getRole(),
                user.getTokenVersion(),
                Boolean.TRUE.equals(user.getIsActive())
        );
    }

    public UUID getId() {
        return id;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public UUID getDepartmentId() {
        return departmentId;
    }

    public String getRole() {
        return role;
    }

    public int getTokenVersion() {
        return tokenVersion;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return active;
    }
}
