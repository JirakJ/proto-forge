import pytest
from pydantic import ValidationError

from app.config.env import load_env


class TestLoadEnv:
    def test_applies_every_default_to_an_empty_record(self) -> None:
        env = load_env({})
        assert env.PORT == 3000
        assert env.LOG_LEVEL == "info"
        assert env.DATABASE_URL is None
        assert env.GIT_SHA == "dev"

    def test_coerces_port_from_its_string_form(self) -> None:
        assert load_env({"PORT": "8080"}).PORT == 8080

    def test_accepts_a_full_record_including_a_database_url(self) -> None:
        env = load_env(
            {
                "PORT": "4000",
                "LOG_LEVEL": "debug",
                "DATABASE_URL": "postgresql+psycopg://localhost:5432/notes",
                "GIT_SHA": "abc1234",
            }
        )
        assert env.PORT == 4000
        assert env.LOG_LEVEL == "debug"
        assert str(env.DATABASE_URL) == "postgresql+psycopg://localhost:5432/notes"
        assert env.GIT_SHA == "abc1234"

    def test_ignores_environment_keys_outside_the_model(self) -> None:
        assert load_env({"PATH": "/usr/bin", "TERM": "xterm"}).PORT == 3000

    def test_rejects_out_of_range_port_bad_level_and_non_url_database(self) -> None:
        with pytest.raises(ValidationError):
            load_env({"PORT": "0"})
        with pytest.raises(ValidationError):
            load_env({"PORT": "70000"})
        with pytest.raises(ValidationError):
            load_env({"LOG_LEVEL": "loud"})
        with pytest.raises(ValidationError):
            load_env({"DATABASE_URL": "not a url"})

    def test_reads_os_environ_when_no_record_is_given(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PORT", "5000")
        env = load_env()
        assert env.PORT == 5000
