package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class AdminResetPasswordRequest {

    @NotBlank(message = "New password is required")
    @Size(min = 10, max = 128, message = "Password must be between 10 and 128 characters")
    @JsonProperty("new_password")
    private String newPassword;

    public AdminResetPasswordRequest() {}

    public AdminResetPasswordRequest(String newPassword) {
        this.newPassword = newPassword;
    }

    public String getNewPassword() {
        return newPassword;
    }

    public void setNewPassword(String newPassword) {
        this.newPassword = newPassword;
    }
}
