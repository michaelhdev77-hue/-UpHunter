"""Unit tests for analytics Kafka consumer mappings."""
from __future__ import annotations

import pytest

from tests._import_helper import import_from_service

_consumer = import_from_service("analytics", "app.kafka_consumer")

TOPIC_TO_STAGE = _consumer.TOPIC_TO_STAGE
TOPICS = _consumer.TOPICS


class TestTopicMapping:
    def test_all_expected_topics(self):
        assert "job.discovered" in TOPIC_TO_STAGE
        assert "job.scored" in TOPIC_TO_STAGE
        assert "letter.generated" in TOPIC_TO_STAGE
        assert "job.status_changed" in TOPIC_TO_STAGE

    def test_discovered_maps_to_discovered(self):
        assert TOPIC_TO_STAGE["job.discovered"] == "discovered"

    def test_scored_maps_to_scored(self):
        assert TOPIC_TO_STAGE["job.scored"] == "scored"

    def test_letter_generated_maps_to_letter_ready(self):
        assert TOPIC_TO_STAGE["letter.generated"] == "letter_ready"

    def test_status_changed_is_dynamic(self):
        assert TOPIC_TO_STAGE["job.status_changed"] is None

    def test_topics_list_matches_keys(self):
        assert set(TOPICS) == set(TOPIC_TO_STAGE.keys())

    def test_topics_count(self):
        assert len(TOPICS) == 4
