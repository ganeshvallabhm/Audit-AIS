from collections import defaultdict, deque
import math
from threading import Lock
import time

from fastapi import HTTPException, Request, status

from app.core.config import get_settings


class SlidingWindowRateLimiter:
    """Thread-safe in-process sliding-window rate limiter with per-bucket eviction."""

    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, *, max_requests: int, window_seconds: int) -> None:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return

        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            dq = self._buckets[key]
            while dq and dq[0] <= cutoff:
                dq.popleft()
            if len(dq) >= max_requests:
                retry_after = max(1, int(math.ceil(dq[0] + window_seconds - now)))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Retry after {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )
            dq.append(now)

    def reset(self, prefix: str | None = None) -> None:
        with self._lock:
            if prefix is None:
                self._buckets.clear()
            else:
                keys = [k for k in self._buckets if k.startswith(prefix)]
                for k in keys:
                    self._buckets.pop(k, None)


rate_limiter = SlidingWindowRateLimiter()


def client_rate_key(request: Request, scope: str, extra: str | None = None) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    elif request.client:
        ip = request.client.host
    else:
        ip = "unknown"
    return f"{scope}:{ip}:{extra.lower()}" if extra else f"{scope}:{ip}"

