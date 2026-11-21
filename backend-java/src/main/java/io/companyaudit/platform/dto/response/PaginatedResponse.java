package io.companyaudit.platform.dto.response;

import java.util.List;

public class PaginatedResponse<T> {

    private List<T> items;
    private long total;
    private int limit;
    private int offset;

    public PaginatedResponse() {}

    public PaginatedResponse(List<T> items, long total, int limit, int offset) {
        this.items = items;
        this.total = total;
        this.limit = limit;
        this.offset = offset;
    }

    public List<T> getItems() {
        return items;
    }

    public void setItems(List<T> items) {
        this.items = items;
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    public int getLimit() {
        return limit;
    }

    public void setLimit(int limit) {
        this.limit = limit;
    }

    public int getOffset() {
        return offset;
    }

    public void setOffset(int offset) {
        this.offset = offset;
    }
}
