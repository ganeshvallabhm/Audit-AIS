package io.companyaudit.platform.dto.response;

public class AuditStageOut {

    private String name;
    private int progress;
    private String state; // "completed", "active", "pending"

    public AuditStageOut() {}

    public AuditStageOut(String name, int progress, String state) {
        this.name = name;
        this.progress = progress;
        this.state = state;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getProgress() {
        return progress;
    }

    public void setProgress(int progress) {
        this.progress = progress;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }
}
