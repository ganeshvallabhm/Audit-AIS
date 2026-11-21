package io.companyaudit.platform.dto.response;

public record HealthResponse(
    String status,
    String database,
    String environment
) {}
