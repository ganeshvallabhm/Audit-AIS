import asyncio
from contextlib import asynccontextmanager
import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text

from app.api.routes import api_router
from app.core.config import get_settings
from app.core.database import SessionLocal, engine
from app.core.logging_config import configure_structured_logging, request_id_ctx
from app.models.core import Company
from app.services.notifications import run_company_sla_sweep

logger = logging.getLogger("companyaudit.api")


async def _sla_scheduler_loop(interval_seconds: int) -> None:
    await asyncio.sleep(5)
    while True:
        try:
            with SessionLocal() as db:
                companies = list(
                    db.scalars(
                        select(Company).where(Company.is_active.is_(True), Company.sla_auto_escalate.is_(True))
                    ).all()
                )
                for comp in companies:
                    result = run_company_sla_sweep(db, comp)
                    if result["notifications_created"] > 0:
                        logger.info(
                            "SLA scheduler generated %s notifications for company %s",
                            result["notifications_created"],
                            comp.id,
                            extra={"company_id": str(comp.id)},
                        )
                db.commit()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Unhandled error inside SLA automation scheduler cycle")
        await asyncio.sleep(max(60, interval_seconds))


def _init_optional_sentry(dsn: str | None, environment: str) -> None:
    if not dsn:
        return
    try:
        import sentry_sdk  # type: ignore[import-not-found]

        sentry_sdk.init(dsn=dsn, environment=environment, traces_sample_rate=0.1)
    except Exception:
        logger.warning("Sentry DSN provided but sentry-sdk failed to initialize.")


def create_app() -> FastAPI:
    settings = get_settings()
    settings.evidence_root.mkdir(parents=True, exist_ok=True)
    configure_structured_logging(settings.environment)
    _init_optional_sentry(settings.sentry_dsn, settings.environment)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        task: asyncio.Task | None = None
        if settings.enable_background_scheduler and settings.environment not in {"test"}:
            task = asyncio.create_task(_sla_scheduler_loop(settings.scheduler_interval_seconds))
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    app = FastAPI(
        title=settings.app_name,
        version="2.0.0",
        docs_url="/api/docs" if settings.environment in {"development", "test"} else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Requested-With",
            "X-CSRF-Token",
            "X-Request-ID",
        ],
        expose_headers=["Content-Disposition", "X-Evidence-SHA256", "X-Request-ID"],
    )

    @app.middleware("http")
    async def request_context_and_security_headers(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or str(uuid4())
        token = request_id_ctx.set(req_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)

        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers.setdefault("X-Request-ID", req_id)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

        if request.url.path != f"{settings.api_prefix}/health":
            logger.info(
                "http_request",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "latency_ms": latency_ms,
                },
            )
        return response

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        err_ref = str(uuid4())[:12]
        logger.exception(
            "Unhandled server exception",
            extra={
                "method": request.method,
                "path": request.url.path,
                "error_ref": err_ref,
            },
        )
        return JSONResponse(
            status_code=500,
            content={
                "detail": f"Internal server error. Reference ID: {err_ref}",
                "error_ref": err_ref,
            },
        )

    @app.get(f"{settings.api_prefix}/health", tags=["System"])
    def health_check() -> dict[str, str]:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected", "environment": settings.environment}

    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
