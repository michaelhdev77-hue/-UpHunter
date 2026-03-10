"""Auth Service — main FastAPI application."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from sqlalchemy import select

from app.db import engine, async_session
from app.models import Base, User, TeamProfile
from app.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
                    hashed_password=pwd_context.hash("admin"),
                    name="Admin",
                )
            )
            await db.commit()
            logger.info("Seeded default admin user: admin@uphunter.local / admin")

        # Seed default team profile
        result = await db.execute(select(TeamProfile).limit(1))
        if not result.scalar_one_or_none():
            db.add(
                TeamProfile(
                    name="Default Team",
                    skills_description="ДОБАВИМ ПОЗЖЕ",
                    portfolio_description="ДОБАВИМ ПОЗЖЕ",
                    cover_letter_style="ДОБАВИМ ПОЗЖЕ",
                )
            )
            await db.commit()
            logger.info("Seeded default team profile")

    logger.info("Auth Service started")
    yield
    logger.info("Auth Service stopped")


app = FastAPI(
    title="UpHunter Auth Service",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="", tags=["auth"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "auth"}
