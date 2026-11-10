from contextvars import ContextVar
from datetime import UTC, datetime
import json
import logging
import re
from typing import Any

request_id_ctx: ContextVar[str | None] = ContextVar("request_id_ctx", default=None)

_REDACT_PATTERN = re.compile(
    r"(bearer\s+[a-z0-9\-_.=]+|password[\"']?\s*[:=]\s*[\"']?[^\"',\s}]+|api[_-]?key[\"']?\s*[:=]\s*[\"']?[^\"',\s}]+)",
    re.IGNORECASE,
)


def redact_sensitive(value: str) -> str:
    return _REDACT_PATTERN.sub("[REDACTED]", value)


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_sensitive(record.getMessage()),
        }
        req_id = request_id_ctx.get()
        if req_id:
            payload["request_id"] = req_id

        for extra_key in ("method", "path", "status_code", "latency_ms", "error_ref", "company_id"):
            val = getattr(record, extra_key, None)
            if val is not None:
                payload[extra_key] = val

        if record.exc_info and record.exc_info[0] is not None:
            payload["exception_type"] = record.exc_info[0].__name__
            payload["traceback"] = redact_sensitive(self.formatException(record.exc_info))

        return json.dumps(payload, default=str)


def configure_structured_logging(environment: str) -> None:
    root = logging.getLogger("companyaudit")
    root.setLevel(logging.INFO if environment != "test" else logging.WARNING)
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    root.handlers = [handler]
    root.propagate = False

