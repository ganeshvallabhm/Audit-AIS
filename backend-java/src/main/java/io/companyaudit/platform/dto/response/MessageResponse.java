package io.companyaudit.platform.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public class MessageResponse {

    private String message;
    private String detail;

    public MessageResponse() {}

    public MessageResponse(String message) {
        this.message = message;
        this.detail = message;
    }

    public String getMessage() {
        return message != null ? message : detail;
    }

    public void setMessage(String message) {
        this.message = message;
        if (this.detail == null) {
            this.detail = message;
        }
    }

    public String getDetail() {
        return detail != null ? detail : message;
    }

    public void setDetail(String detail) {
        this.detail = detail;
        if (this.message == null) {
            this.message = detail;
        }
    }
}
