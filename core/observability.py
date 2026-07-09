import json
import logging
import time
import uuid

from fastapi import FastAPI, Request


def configure_logging(level_name: str = "INFO") -> logging.Logger:
    level = getattr(logging, level_name.upper(), logging.INFO)
    app_logger = logging.getLogger("aerotravel")
    app_logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    app_logger.addHandler(handler)
    app_logger.setLevel(level)
    app_logger.propagate = False
    return app_logger


def log_event(logger: logging.Logger, level: int, event: str, **fields):
    payload = {"event": event, **fields}
    logger.log(level, json.dumps(payload, ensure_ascii=False, default=str))


def install_operability_middleware(app: FastAPI, app_env: str, logger: logging.Logger):
    @app.middleware("http")
    async def add_operability_headers(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            log_event(
                logger,
                logging.ERROR,
                "request_failed",
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                duration_ms=duration_ms,
                error_type=exc.__class__.__name__,
            )
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["x-request-id"] = request_id
        response.headers.setdefault("x-content-type-options", "nosniff")
        response.headers.setdefault("x-frame-options", "DENY")
        response.headers.setdefault("referrer-policy", "no-referrer")
        response.headers.setdefault("permissions-policy", "camera=(), microphone=(), geolocation=()")
        if app_env == "production":
            response.headers.setdefault("strict-transport-security", "max-age=31536000; includeSubDomains")

        log_event(
            logger,
            logging.INFO,
            "request_completed",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response
