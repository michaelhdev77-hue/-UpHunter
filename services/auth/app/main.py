"""Auth Service — main FastAPI application."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import bcrypt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.db import engine, async_session
from app.models import Base, User, TeamProfile
from app.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed default admin if no users exist
    async with async_session() as db:
        result = await db.execute(select(User).limit(1))
        if not result.scalar_one_or_none():
            db.add(
                User(
                    email="admin@uphunter.local",
                    hashed_password=bcrypt.hashpw(b"admin", bcrypt.gensalt()).decode(),
                    name="Admin",
                )
            )
            await db.commit()
            logger.info("Seeded default admin user: admin@uphunter.local / admin")

        # Seed default team profile for admin user
        result = await db.execute(select(TeamProfile).limit(1))
        if not result.scalar_one_or_none():
            # Get admin user id
            admin_result = await db.execute(
                select(User).where(User.email == "admin@uphunter.local")
            )
            admin = admin_result.scalar_one_or_none()
            if admin:
                db.add(
                    TeamProfile(
                        user_id=admin.id,
                        name="Default Team",
                        skills_description="ДОБАВИМ ПОЗЖЕ",
                        portfolio_description="ДОБАВИМ ПОЗЖЕ",
                        cover_letter_style="ДОБАВИМ ПОЗЖЕ",
                    )
                )
                await db.commit()
                logger.info("Seeded default team profile for admin user")

    logger.info("Auth Service started")
    yield
    logger.info("Auth Service stopped")


app = FastAPI(
    title="UpHunter Auth Service",
    version="0.1.0",
    lifespan=lifespan,
)

# OpenTelemetry tracing
_resource = Resource.create({"service.name": "uphunter-auth"})
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

app.include_router(router, prefix="", tags=["auth"])


# Prometheus metrics
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app, endpoint="/metrics")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "auth"}
