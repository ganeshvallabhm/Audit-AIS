package io.companyaudit.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class ChecklistCreate {

    @Size(min = 3, max = 32)
    private String code;

    @NotBlank(message = "Title is required")
    @Size(min = 3, max = 200)
    private String title;

    @NotBlank(message = "Domain is required")
    private String domain;

    @NotBlank(message = "Framework is required")
    @Size(min = 2, max = 120)
    private String framework;

    @NotBlank(message = "Version is required")
    @Size(min = 1, max = 24)
    private String version = "2025.4";

    public ChecklistCreate() {}

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getFramework() {
        return framework;
    }

    public void setFramework(String framework) {
        this.framework = framework;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }
}
