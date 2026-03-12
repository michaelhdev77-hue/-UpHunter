"""Jobs Service — main FastAPI application."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.db import engine
from app.models import Base
from app.poller import run_poller
from app.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Migrate: remove 'approved' from jobstatus enum if it still exists
    try:
        async with engine.begin() as conn:
            from sqlalchemy import text
            row = await conn.execute(text(
                "SELECT 1 FROM pg_enum WHERE enumlabel = 'approved' "
                "AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'jobstatus')"
            ))
            if row.scalar():
                await conn.execute(text(
                    "UPDATE jobs SET status = 'under_review' "
                    "WHERE status::text = 'approved'"
                ))
                await conn.execute(text(
                    "DELETE FROM pg_enum WHERE enumlabel = 'approved' "
                    "AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'jobstatus')"
                ))
                logger.info("Migrated: removed 'approved' from jobstatus enum")
    except Exception:
        logger.exception("Migration warning: failed to clean up 'approved' enum value (non-fatal)")

    logger.info("Jobs Service started — tables ready")

    # Start Kafka producer
    from app.kafka_producer import start_producer, stop_producer
    await start_producer()

    # Start background poller
    poller_task = asyncio.create_task(run_poller())

    yield

    # Shutdown
    poller_task.cancel()
    try:
        await poller_task
    except asyncio.CancelledError:
        pass
    await stop_producer()
    logger.info("Jobs Service stopped")


app = FastAPI(
    title="UpHunter Jobs Service",
    version="0.1.0",
    lifespan=lifespan,
)

# OpenTelemetry tracing
_resource = Resource.create({"service.name": "uphunter-jobs"})
_provider = TracerProvider(resource=_resource)
_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint="http://jaeger:4317", insecure=True)))
trace.set_tracer_provider(_provider)
FastAPIInstrumentor.instrument_app(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "jobs"}


app.include_router(router, prefix="", tags=["jobs"])

# Prometheus metrics
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app, endpoint="/metrics")
