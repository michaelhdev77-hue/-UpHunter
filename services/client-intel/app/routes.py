"""Client Intelligence Service API routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Client, ClientResponse, ClientRiskScore

router = APIRouter()


class AnalyzeRequest(BaseModel):
    upwork_uid: str


@router.get("/risk/{upwork_uid}", response_model=ClientRiskScore)
async def get_client_risk(upwork_uid: str, db: AsyncSession = Depends(get_db)):
    """Get client risk assessment."""
    result = await db.execute(select(Client).where(Client.upwork_uid == upwork_uid))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return ClientRiskScore.model_validate(client)


@router.get("/{upwork_uid}", response_model=ClientResponse)
async def get_client(upwork_uid: str, db: AsyncSession = Depends(get_db)):
    """Get client details."""
    result = await db.execute(select(Client).where(Client.upwork_uid == upwork_uid))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return ClientResponse.model_validate(client)


@router.post("/analyze", response_model=ClientResponse)
async def analyze_client(body: AnalyzeRequest, db: AsyncSession = Depends(get_db)):
    """Analyze a client by Upwork UID.

    TODO: Fetch client data from Upwork API, compute risk score,
    detect red flags, and store in database.
    """
    # Check if client already exists
    result = await db.execute(select(Client).where(Client.upwork_uid == body.upwork_uid))
    client = result.scalar_one_or_none()
    if client:
        return ClientResponse.model_validate(client)

    # TODO: Fetch from Upwork API
    # TODO: Compute risk score based on payment history, hire rate, etc.
    # TODO: Detect red flags

    # Create placeholder client record
    client = Client(
        upwork_uid=body.upwork_uid,
        name="Unknown",
        risk_score=50.0,
        red_flags=[],
    )
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return ClientResponse.model_validate(client)
