"""Kafka event consumer for Analytics Service."""
from __future__ import annotations

import json
import logging

from aiokafka import AIOKafkaConsumer

from app.config import settings
from app.db import async_session
from app.models import FunnelEvent

logger = logging.getLogger(__name__)

TOPIC_TO_STAGE = {
    "job.discovered": "discovered",
    "job.scored": "scored",
    "letter.generated": "letter_ready",
    "job.status_changed": None,  # stage from payload
}

TOPICS = list(TOPIC_TO_STAGE.keys())


async def run_consumer() -> None:
    """Run Kafka consumer loop, inserting funnel events."""
    if not settings.kafka_enabled:
        logger.info("Kafka disabled, skipping consumer")
        return

    consumer = AIOKafkaConsumer(
        *TOPICS,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id="analytics-consumer",
        auto_offset_reset="earliest",
        value_deserializer=lambda v: json.loads(v.decode()),
    )

    try:
        await consumer.start()
        logger.info("Kafka consumer started, topics: %s", TOPICS)
    except Exception:
        logger.exception("Failed to start Kafka consumer")
        return

    try:
        async for msg in consumer:
            try:
                data = msg.value
                topic = msg.topic
                job_id = data.get("job_id")

                if job_id is None:
                    continue

                # Determine stage
                stage = TOPIC_TO_STAGE.get(topic)
                if topic == "job.status_changed":
                    stage = data.get("new_status")
                if not stage:
                    continue

                # Insert funnel event
                async with async_session() as db:
                    event = FunnelEvent(
                        job_id=job_id,
                        user_id=data.get("user_id"),
                        stage=stage,
                        metadata_=data,
                    )
                    db.add(event)
                    await db.commit()

                # Telegram notifications — read config from DB
                await _send_notifications(topic, data)

                logger.debug("Recorded event: job_id=%s stage=%s", job_id, stage)

            except Exception:
                logger.exception("Error processing Kafka message")
    finally:
        await consumer.stop()
        logger.info("Kafka consumer stopped")


async def _send_notifications(topic: str, data: dict) -> None:
    """Send Telegram notifications based on event type, using DB config."""
    try:
        from app.telegram import (
            get_telegram_config,
            send_letter_notification,
            send_scored_notification,
            send_status_notification,
        )

        async with async_session() as db:
            config = await get_telegram_config(db)

        if not config.enabled:
            return

        if topic == "job.scored":
            score = data.get("overall_score", 0)
            if score >= config.score_threshold:
                await send_scored_notification(data, config=config)

        elif topic == "letter.generated":
            await send_letter_notification(data, config=config)

        elif topic == "job.status_changed":
            await send_status_notification(data, config=config)

    except Exception:
        logger.exception("Failed to send Telegram notification")
