"""Kafka event producer."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from aiokafka import AIOKafkaProducer

from app.config import settings

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None


async def start_producer() -> None:
    global _producer
    if not settings.kafka_enabled:
        logger.info("Kafka disabled, skipping producer start")
        return
    for attempt in range(5):
        try:
            _producer = AIOKafkaProducer(
                bootstrap_servers=settings.kafka_bootstrap_servers,
                value_serializer=lambda v: json.dumps(v, default=str).encode(),
            )
            await _producer.start()
            logger.info("Kafka producer started")
            return
        except Exception:
            _producer = None
            delay = min(2 ** attempt, 30)
            logger.warning("Kafka producer connect attempt %d/5 failed, retry in %ds", attempt + 1, delay)
            await asyncio.sleep(delay)
    logger.error("Kafka producer failed to connect after 5 attempts, events will be dropped")


async def stop_producer() -> None:
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None
        logger.info("Kafka producer stopped")


async def publish_event(topic: str, data: dict[str, Any]) -> None:
    if not _producer:
        return
    try:
        await _producer.send_and_wait(topic, data)
        logger.debug("Published event to %s: job_id=%s", topic, data.get("job_id"))
    except Exception:
        logger.exception("Failed to publish event to %s", topic)
