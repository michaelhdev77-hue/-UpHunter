"""AI Scoring Service — main FastAPI application."""
from __future__ import annotations

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
from app.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("AI Scoring Service started — tables ready")
    from app.kafka_producer import start_producer, stop_producer
    await start_producer()
    yield
    await stop_producer()
    logger.info("AI Scoring Service stopped")


app = FastAPI(
    title="UpHunter AI Scoring Service",
    version="0.1.0",
    lifespan=lifespan,
)

# OpenTelemetry tracing
_resource = Resource.create({"service.name": "uphunter-ai-scoring"})
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

# Health endpoint registered BEFORE router to avoid route conflicts
@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-scoring"}


app.include_router(router, prefix="", tags=["ai-scoring"])

# Prometheus metrics
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app, endpoint="/metrics")
