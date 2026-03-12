"""Client Intelligence Service API routes."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Client, ClientListResponse, ClientResponse, ClientRiskScore, RiskConfig

router = APIRouter()

# -- Country risk classification ----------------------------------------------

HIGH_RISK_COUNTRIES = {
    "nigeria", "pakistan", "bangladesh", "kenya", "ghana",
    "cameroon", "uganda", "tanzania", "ethiopia", "zimbabwe",
}

MEDIUM_RISK_COUNTRIES = {
    "india", "philippines", "egypt", "vietnam", "indonesia",
    "morocco", "tunisia", "colombia", "peru", "nepal",
}

LOW_RISK_COUNTRIES = {
    "united states", "united kingdom", "germany", "canada", "australia",
    "netherlands", "sweden", "switzerland", "france", "japan",
    "ireland", "denmark", "norway", "finland", "austria",
    "new zealand", "singapore", "israel", "belgium", "italy", "spain",
}


# -- Scoring helpers ----------------------------------------------------------


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(value, hi))


def normalize_inverse(value: Optional[float], lo: float, hi: float) -> float:
    """Higher value -> lower risk (returns closer to 0)."""
    if value is None:
        return 1.0  # missing data = max risk contribution
    span = hi - lo
    if span == 0:
        return 0.0
    return 1.0 - _clamp(value - lo, 0, span) / span


def age_penalty(member_since: Optional[datetime]) -> float:
    """Newer accounts are riskier."""
    if member_since is None:
        return 1.0
    now = datetime.now(timezone.utc)
    # Make member_since offset-aware if it isn't
    if member_since.tzinfo is None:
        member_since = member_since.replace(tzinfo=timezone.utc)
    age_days = (now - member_since).days
    if age_days < 30:
        return 1.0
    if age_days < 180:
        return 0.5
    if age_days < 365:
        return 0.2
    return 0.0


def location_risk(country: Optional[str]) -> float:
    if not country:
        return 0.5  # unknown country = moderate risk
    c = country.strip().lower()
    if c in HIGH_RISK_COUNTRIES:
        return 0.8
    if c in MEDIUM_RISK_COUNTRIES:
        return 0.3
    if c in LOW_RISK_COUNTRIES:
        return 0.0
    return 0.2  # unlisted countries get small penalty


class _RiskWeights:
    """Default risk weights — overridden by DB RiskConfig if present."""
    weight_payment_verified: float = 0.25
    weight_total_spent: float = 0.20
    weight_hire_rate: float = 0.15
    weight_rating: float = 0.15
    weight_reviews: float = 0.10
    weight_account_age: float = 0.10
    weight_location: float = 0.05
    flag_hire_rate_below: float = 20.0
    flag_rating_below: float = 3.0
    flag_account_age_days: int = 30
    flag_no_reviews_min_jobs: int = 10


_DEFAULT_WEIGHTS = _RiskWeights()


async def _get_risk_config(db: AsyncSession) -> _RiskWeights:
    """Read DB-backed risk config or return defaults."""
    result = await db.execute(select(RiskConfig).where(RiskConfig.id == 1))
    row = result.scalar_one_or_none()
    if row is None:
        return _DEFAULT_WEIGHTS
    w = _RiskWeights()
    w.weight_payment_verified = row.weight_payment_verified
    w.weight_total_spent = row.weight_total_spent
    w.weight_hire_rate = row.weight_hire_rate
    w.weight_rating = row.weight_rating
    w.weight_reviews = row.weight_reviews
    w.weight_account_age = row.weight_account_age
    w.weight_location = row.weight_location
    w.flag_hire_rate_below = row.flag_hire_rate_below
    w.flag_rating_below = row.flag_rating_below
    w.flag_account_age_days = row.flag_account_age_days
    w.flag_no_reviews_min_jobs = row.flag_no_reviews_min_jobs
    return w


def compute_risk_score(
    payment_verified: bool,
    total_spent: Optional[float],
    hire_rate: Optional[float],
    rating: Optional[float],
    reviews_count: Optional[int],
    member_since: Optional[datetime],
    country: Optional[str],
    cfg: _RiskWeights = _DEFAULT_WEIGHTS,
) -> float:
    score = (
        cfg.weight_payment_verified * (1.0 if not payment_verified else 0.0)
        + cfg.weight_total_spent * normalize_inverse(total_spent, 0, 100_000)
        + cfg.weight_hire_rate * normalize_inverse(hire_rate, 0, 100)
        + cfg.weight_rating * normalize_inverse(rating, 0, 5)
        + cfg.weight_reviews * normalize_inverse(reviews_count, 0, 50)
        + cfg.weight_account_age * age_penalty(member_since)
        + cfg.weight_location * location_risk(country)
    ) * 100
    return round(_clamp(score, 0, 100), 1)


def detect_red_flags(
    payment_verified: bool,
    total_spent: Optional[float],
    hire_rate: Optional[float],
    rating: Optional[float],
    reviews_count: Optional[int],
    jobs_posted: Optional[int],
    member_since: Optional[datetime],
    cfg: _RiskWeights = _DEFAULT_WEIGHTS,
) -> list[str]:
    flags: list[str] = []

    if not payment_verified:
        flags.append("Payment method NOT verified")

    if total_spent is None or total_spent == 0:
        flags.append("New account with $0 spent")

    if hire_rate is not None and hire_rate < cfg.flag_hire_rate_below:
        flags.append(f"Hire rate below {cfg.flag_hire_rate_below}%")

    if rating is not None and rating < cfg.flag_rating_below:
        flags.append(f"Rating below {cfg.flag_rating_below}")

    if member_since is not None:
        if member_since.tzinfo is None:
            ms = member_since.replace(tzinfo=timezone.utc)
        else:
            ms = member_since
        if (datetime.now(timezone.utc) - ms).days < cfg.flag_account_age_days:
            flags.append(f"New account (less than {cfg.flag_account_age_days} days)")

    jp = jobs_posted or 0
    rc = reviews_count or 0
    if rc == 0 and jp >= cfg.flag_no_reviews_min_jobs:
        flags.append(f"No reviews despite {cfg.flag_no_reviews_min_jobs}+ jobs posted")

    return flags


# -- Request schemas ----------------------------------------------------------


class AnalyzeRequest(BaseModel):
    upwork_uid: str
    name: Optional[str] = None
    company: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    member_since: Optional[datetime] = None
    payment_verified: bool = False
    total_spent: Optional[float] = 0.0
    hire_rate: Optional[float] = None
    jobs_posted: Optional[int] = 0
    active_hires: Optional[int] = 0
    rating: Optional[float] = None
    reviews_count: Optional[int] = 0
    avg_hourly_rate: Optional[float] = None


class AnalyzeFromJobRequest(BaseModel):
    """Accepts denormalized client fields from a Job model."""
    upwork_uid: str
    client_name: Optional[str] = None
    client_company: Optional[str] = None
    client_country: Optional[str] = None
    client_city: Optional[str] = None
    client_member_since: Optional[datetime] = None
    client_payment_verified: bool = False
    client_total_spent: Optional[float] = 0.0
    client_hire_rate: Optional[float] = None
    client_jobs_posted: Optional[int] = 0
    client_active_hires: Optional[int] = 0
    client_rating: Optional[float] = None
    client_reviews_count: Optional[int] = 0
    client_avg_hourly_rate: Optional[float] = None


# -- Helpers ------------------------------------------------------------------


def _apply_fields_to_client(client: Client, fields: dict) -> None:
    """Set non-None fields on the ORM object."""
    for key, value in fields.items():
        if value is not None:
            setattr(client, key, value)


async def _upsert_and_score(
    db: AsyncSession,
    upwork_uid: str,
    name: Optional[str],
    company: Optional[str],
    country: Optional[str],
    city: Optional[str],
    member_since: Optional[datetime],
    payment_verified: bool,
    total_spent: Optional[float],
    hire_rate: Optional[float],
    jobs_posted: Optional[int],
    active_hires: Optional[int],
    rating: Optional[float],
    reviews_count: Optional[int],
    avg_hourly_rate: Optional[float],
) -> Client:
    """Create or update a Client record with computed risk scoring."""
    result = await db.execute(
        select(Client).where(Client.upwork_uid == upwork_uid)
    )
    client = result.scalar_one_or_none()

    fields = dict(
        name=name,
        company=company,
        country=country,
        city=city,
        member_since=member_since,
        payment_verified=payment_verified,
        total_spent=total_spent,
        hire_rate=hire_rate,
        jobs_posted=jobs_posted,
        active_hires=active_hires,
        rating=rating,
        reviews_count=reviews_count,
        avg_hourly_rate=avg_hourly_rate,
    )

    if client is None:
        client = Client(upwork_uid=upwork_uid)
        _apply_fields_to_client(client, fields)
        db.add(client)
    else:
        _apply_fields_to_client(client, fields)

    # Always recompute scoring from current values
    cfg = await _get_risk_config(db)
    client.risk_score = compute_risk_score(
        payment_verified=client.payment_verified or False,
        total_spent=client.total_spent,
        hire_rate=client.hire_rate,
        rating=client.rating,
        reviews_count=client.reviews_count,
        member_since=client.member_since,
        country=client.country,
        cfg=cfg,
    )
    client.red_flags = detect_red_flags(
        payment_verified=client.payment_verified or False,
        total_spent=client.total_spent,
        hire_rate=client.hire_rate,
        rating=client.rating,
        reviews_count=client.reviews_count,
        jobs_posted=client.jobs_posted,
        member_since=client.member_since,
        cfg=cfg,
    )

    await db.commit()
    await db.refresh(client)
    return client


# -- Risk Config Schemas & Endpoints ------------------------------------------


class RiskConfigSchema(BaseModel):
    weight_payment_verified: float = 0.25
    weight_total_spent: float = 0.20
    weight_hire_rate: float = 0.15
    weight_rating: float = 0.15
    weight_reviews: float = 0.10
    weight_account_age: float = 0.10
    weight_location: float = 0.05
    flag_hire_rate_below: float = 20.0
    flag_rating_below: float = 3.0
    flag_account_age_days: int = 30
    flag_no_reviews_min_jobs: int = 10

    model_config = {"from_attributes": True}


class RiskConfigUpdate(BaseModel):
    weight_payment_verified: Optional[float] = None
    weight_total_spent: Optional[float] = None
    weight_hire_rate: Optional[float] = None
    weight_rating: Optional[float] = None
    weight_reviews: Optional[float] = None
    weight_account_age: Optional[float] = None
    weight_location: Optional[float] = None
    flag_hire_rate_below: Optional[float] = None
    flag_rating_below: Optional[float] = None
    flag_account_age_days: Optional[int] = None
    flag_no_reviews_min_jobs: Optional[int] = None


@router.get("/settings", response_model=RiskConfigSchema)
async def get_risk_settings(db: AsyncSession = Depends(get_db)):
    """Get current client risk scoring configuration."""
    result = await db.execute(select(RiskConfig).where(RiskConfig.id == 1))
    row = result.scalar_one_or_none()
    if row:
        return RiskConfigSchema.model_validate(row)
    return RiskConfigSchema()


@router.put("/settings", response_model=RiskConfigSchema)
async def update_risk_settings(body: RiskConfigUpdate, db: AsyncSession = Depends(get_db)):
    """Update client risk scoring configuration."""
    result = await db.execute(select(RiskConfig).where(RiskConfig.id == 1))
    row = result.scalar_one_or_none()
    if row is None:
        row = RiskConfig(id=1)
        db.add(row)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return RiskConfigSchema.model_validate(row)


# -- Routes -------------------------------------------------------------------


@router.get("/", response_model=ClientListResponse)
async def list_clients(
    search: Optional[str] = None,
    min_risk: Optional[float] = None,
    max_risk: Optional[float] = None,
    country: Optional[str] = None,
    sort_by: str = "risk_score",
    sort_dir: str = "desc",
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List all analyzed clients with filtering and sorting."""
    from sqlalchemy import func as sqlfunc, desc, asc

    query = select(Client)
    count_query = select(sqlfunc.count(Client.id))

    if search:
        pattern = f"%{search}%"
        query = query.where(
            (Client.name.ilike(pattern))
            | (Client.company.ilike(pattern))
            | (Client.upwork_uid.ilike(pattern))
        )
        count_query = count_query.where(
            (Client.name.ilike(pattern))
            | (Client.company.ilike(pattern))
            | (Client.upwork_uid.ilike(pattern))
        )
    if min_risk is not None:
        query = query.where(Client.risk_score >= min_risk)
        count_query = count_query.where(Client.risk_score >= min_risk)
    if max_risk is not None:
        query = query.where(Client.risk_score <= max_risk)
        count_query = count_query.where(Client.risk_score <= max_risk)
    if country:
        query = query.where(Client.country.ilike(f"%{country}%"))
        count_query = count_query.where(Client.country.ilike(f"%{country}%"))

    allowed_sort = {"risk_score", "total_spent", "rating", "updated_at", "name", "jobs_posted"}
    col = getattr(Client, sort_by if sort_by in allowed_sort else "risk_score")
    query = query.order_by(desc(col) if sort_dir == "desc" else asc(col))

    limit = min(limit, 200)
    query = query.offset(offset).limit(limit)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    result = await db.execute(query)
    clients = result.scalars().all()

    return ClientListResponse(
        items=[ClientResponse.model_validate(c) for c in clients],
        total=total,
    )


@router.post("/analyze", response_model=ClientResponse)
async def analyze_client(body: AnalyzeRequest, db: AsyncSession = Depends(get_db)):
    """Analyze a client: compute risk score, detect red flags, upsert in DB."""
    client = await _upsert_and_score(
        db,
        upwork_uid=body.upwork_uid,
        name=body.name,
        company=body.company,
        country=body.country,
        city=body.city,
        member_since=body.member_since,
        payment_verified=body.payment_verified,
        total_spent=body.total_spent,
        hire_rate=body.hire_rate,
        jobs_posted=body.jobs_posted,
        active_hires=body.active_hires,
        rating=body.rating,
        reviews_count=body.reviews_count,
        avg_hourly_rate=body.avg_hourly_rate,
    )
    return ClientResponse.model_validate(client)


@router.post("/analyze-from-job", response_model=ClientResponse)
async def analyze_from_job(
    body: AnalyzeFromJobRequest, db: AsyncSession = Depends(get_db)
):
    """Analyze a client using denormalized fields from a Job model.

    This endpoint is called by the AI Scoring service when it has
    client data embedded in job records (client_country, client_rating, etc.).
    """
    client = await _upsert_and_score(
        db,
        upwork_uid=body.upwork_uid,
        name=body.client_name,
        company=body.client_company,
        country=body.client_country,
        city=body.client_city,
        member_since=body.client_member_since,
        payment_verified=body.client_payment_verified,
        total_spent=body.client_total_spent,
        hire_rate=body.client_hire_rate,
        jobs_posted=body.client_jobs_posted,
        active_hires=body.client_active_hires,
        rating=body.client_rating,
        reviews_count=body.client_reviews_count,
        avg_hourly_rate=body.client_avg_hourly_rate,
    )
    return ClientResponse.model_validate(client)


@router.get("/risk/{upwork_uid}", response_model=ClientRiskScore)
async def get_client_risk(upwork_uid: str, db: AsyncSession = Depends(get_db)):
    """Get client risk assessment."""
    result = await db.execute(
        select(Client).where(Client.upwork_uid == upwork_uid)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return ClientRiskScore.model_validate(client)


@router.get("/{upwork_uid}", response_model=ClientResponse)
async def get_client(upwork_uid: str, db: AsyncSession = Depends(get_db)):
    """Get client details."""
    result = await db.execute(
        select(Client).where(Client.upwork_uid == upwork_uid)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return ClientResponse.model_validate(client)
