import pytest

from app import platform
from app.platform.problems import AppProblem, problems


class TestProblemCatalogue:
    def test_keys_every_entry_by_its_own_code(self) -> None:
        for key, definition in problems.items():
            assert definition.code == key

    def test_carries_the_four_registered_problems_with_their_statuses(self) -> None:
        assert problems["validation-failed"].status == 400
        assert problems["note-not-found"].status == 404
        assert problems["route-not-found"].status == 404
        assert problems["internal"].status == 500
        assert problems["internal"].title == "Unexpected server failure"
        assert problems["route-not-found"].title == "No route matches this method and path"

    def test_is_re_exported_by_the_platform_kernel_surface(self) -> None:
        assert platform.problems is problems
        assert platform.AppProblem is AppProblem
        assert callable(platform.create_logger)
        assert callable(platform.register_health)
        assert platform.SECURITY_HEADERS["x-frame-options"] == "DENY"


class TestAppProblem:
    def test_renders_the_full_rfc_9457_body_when_a_detail_is_present(self) -> None:
        problem = AppProblem("validation-failed", "text: too short")
        assert str(problem) == "The request does not match the operation's schema"
        assert problem.body("/notes") == {
            "type": "/problems/validation-failed",
            "title": "The request does not match the operation's schema",
            "status": 400,
            "detail": "text: too short",
            "instance": "/notes",
            "code": "validation-failed",
        }

    def test_omits_the_detail_member_entirely_when_none_was_given(self) -> None:
        body = AppProblem("note-not-found").body("/notes/x")
        assert body == {
            "type": "/problems/note-not-found",
            "title": "No note exists under this id",
            "status": 404,
            "instance": "/notes/x",
            "code": "note-not-found",
        }
        assert "detail" not in body

    def test_refuses_an_unregistered_code_at_construction(self) -> None:
        with pytest.raises(ValueError, match='unregistered problem code "ghost-error"'):
            AppProblem("ghost-error")
