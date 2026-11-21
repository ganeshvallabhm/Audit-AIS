package io.companyaudit.platform.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

public class EvidenceVerifyRequest {

    @NotBlank
    @JsonProperty("verification_status")
    private String verificationStatus;

    @JsonProperty("verify_file_checksum")
    private Boolean verifyFileChecksum = true;

    public EvidenceVerifyRequest() {}

    public String getVerificationStatus() {
        return verificationStatus;
    }

    public void setVerificationStatus(String verificationStatus) {
        this.verificationStatus = verificationStatus;
    }

    public Boolean getVerifyFileChecksum() {
        return verifyFileChecksum;
    }

    public void setVerifyFileChecksum(Boolean verifyFileChecksum) {
        this.verifyFileChecksum = verifyFileChecksum;
    }
}
