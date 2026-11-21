package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class ChecklistOut {

    private UUID id;

    @JsonProperty("company_id")
    private UUID companyId;

    private String code;

    private String title;

    private String domain;

    private String framework;

    private String version;

    @JsonProperty("is_active")
    private Boolean isActive;

    private List<ChecklistItemOut> items = new ArrayList<>();

    public ChecklistOut() {}

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public void setCompanyId(UUID companyId) {
        this.companyId = companyId;
    }

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

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean active) {
        isActive = active;
    }

    public List<ChecklistItemOut> getItems() {
        return items;
    }

    public void setItems(List<ChecklistItemOut> items) {
        this.items = items;
    }
}
