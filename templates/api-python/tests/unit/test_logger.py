import json

import pytest

from app.platform.logger import CENSOR, create_logger, noop_logger, redact_pii


class TestRedactPii:
    def test_censors_every_pii_named_field_case_insensitively(self) -> None:
        event = {"Password": "hunter2", "token": "t", "noteId": "n1"}
        redacted = redact_pii(None, "info", dict(event))
        assert redacted["Password"] == CENSOR
        assert redacted["token"] == CENSOR
        assert redacted["noteId"] == "n1"


class TestCreateLogger:
    def test_writes_one_sorted_json_line_with_pii_redacted(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        logger = create_logger("info")
        logger.info("login attempt", password="hunter2", email="a@b.c", noteId="n1")
        line = capsys.readouterr().out.strip()
        parsed = json.loads(line)
        assert parsed["password"] == CENSOR
        assert parsed["email"] == CENSOR
        assert parsed["noteId"] == "n1"
        assert parsed["event"] == "login attempt"
        assert parsed["level"] == "info"

    def test_honours_the_requested_level(self, capsys: pytest.CaptureFixture[str]) -> None:
        logger = create_logger("error")
        logger.info("suppressed")
        logger.warning("suppressed too")
        logger.error("kept")
        lines = capsys.readouterr().out.strip().splitlines()
        assert len(lines) == 1
        assert json.loads(lines[0])["event"] == "kept"

    def test_falls_back_to_info_for_an_unknown_level(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        logger = create_logger("loud")
        logger.info("kept")
        assert json.loads(capsys.readouterr().out.strip())["event"] == "kept"


class TestNoopLogger:
    def test_accepts_calls_on_every_level_and_does_nothing(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        noop_logger.info("ignored")
        noop_logger.warning("ignored")
        noop_logger.error("ignored", err="x")
        assert capsys.readouterr().out == ""
