"""
Unit tests for ``binx_api.core.storage`` — both backends, against a temp
directory (local) and the in-memory ``FakeS3`` (see ``tests/conftest.py``).
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from binx_api.core import storage
from tests.conftest import FAKE_BUCKET, FakeS3

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _local_roots(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(storage.settings, "upload_bucket", None)
    for area, setting in storage._LOCAL_DIR_SETTINGS.items():
        monkeypatch.setattr(storage.settings, setting, str(tmp_path / area))


async def _body(response: StreamingResponse) -> bytes:
    return b"".join([chunk async for chunk in response.body_iterator])


class TestS3:
    async def test_save_puts_under_the_area_and_returns_an_s3_path(self, fake_s3: FakeS3) -> None:
        path = await storage.save("projects", "p1/abc_report.pdf", b"pdf", content_type="application/pdf")
        assert path == f"s3://{FAKE_BUCKET}/projects/p1/abc_report.pdf"
        assert fake_s3.objects[(FAKE_BUCKET, "projects/p1/abc_report.pdf")] == (b"pdf", "application/pdf")

    async def test_response_streams_the_object_back(self, fake_s3: FakeS3) -> None:
        path = await storage.save("agencies", "a1/logo_x.png", b"\x89PNG-bytes", content_type="image/png")
        response = await storage.response(path, media_type="image/png")
        assert isinstance(response, StreamingResponse)
        assert response.media_type == "image/png"
        assert response.headers["content-length"] == str(len(b"\x89PNG-bytes"))
        assert "content-disposition" not in response.headers
        assert await _body(response) == b"\x89PNG-bytes"

    @pytest.mark.parametrize("filename", ["report.pdf", "Q3 résumé – final.pdf"])
    async def test_download_disposition_matches_file_response(self, fake_s3: FakeS3, tmp_path, filename) -> None:
        path = await storage.save("projects", f"p1/{filename}", b"x", content_type="application/pdf")
        response = await storage.response(path, media_type="application/pdf", filename=filename)
        # Same header the local backend's FileResponse sends for that name.
        local = FileResponse(tmp_path, filename=filename)
        assert response.headers["content-disposition"] == local.headers["content-disposition"]

    async def test_missing_object_is_a_404(self, fake_s3: FakeS3) -> None:
        with pytest.raises(HTTPException) as exc:
            await storage.response(f"s3://{FAKE_BUCKET}/projects/gone.pdf", media_type="application/pdf")
        assert exc.value.status_code == 404

    async def test_delete_removes_the_object(self, fake_s3: FakeS3) -> None:
        path = await storage.save("messages", "c1/a.txt", b"a", content_type="text/plain")
        await storage.delete(path)
        assert fake_s3.keys() == []

    async def test_delete_prefix_only_touches_that_prefix_and_batches(self, fake_s3: FakeS3) -> None:
        for i in range(2500):
            await storage.save("agencies", f"a1/f{i}.png", b"x", content_type="image/png")
        await storage.save("agencies", "a10/keep.png", b"x", content_type="image/png")
        await storage.save("projects", "a1/keep.pdf", b"x", content_type="application/pdf")

        await storage.delete_prefix("agencies", "a1")

        # `a1/` must not match `a10/`, and other areas are untouched.
        assert fake_s3.keys() == ["agencies/a10/keep.png", "projects/a1/keep.pdf"]
        assert fake_s3.delete_objects_calls == 3

    async def test_local_rows_still_work_after_switching_to_s3(self, fake_s3: FakeS3, tmp_path, monkeypatch) -> None:
        monkeypatch.setattr(storage.settings, "upload_bucket", None)
        local_path = await storage.save("agencies", "a1/logo.png", b"old", content_type="image/png")
        monkeypatch.setattr(storage.settings, "upload_bucket", FAKE_BUCKET)

        response = await storage.response(local_path, media_type="image/png")
        assert isinstance(response, FileResponse)
        await storage.delete(local_path)
        assert not (tmp_path / "agencies" / "a1" / "logo.png").exists()


class TestLocal:
    async def test_save_writes_under_the_area_root(self, tmp_path) -> None:
        path = await storage.save("projects", "p1/tasks/t1/abc_a.pdf", b"pdf", content_type="application/pdf")
        assert path == str(tmp_path / "projects" / "p1" / "tasks" / "t1" / "abc_a.pdf")
        assert (tmp_path / "projects" / "p1" / "tasks" / "t1" / "abc_a.pdf").read_bytes() == b"pdf"

    async def test_missing_file_is_a_404(self, tmp_path) -> None:
        with pytest.raises(HTTPException) as exc:
            await storage.response(str(tmp_path / "nope.png"), media_type="image/png")
        assert exc.value.status_code == 404

    async def test_delete_prefix_removes_the_directory(self, tmp_path) -> None:
        await storage.save("agencies", "users/u1/avatar_x.png", b"x", content_type="image/png")
        await storage.delete_prefix("agencies", "users/u1")
        assert not (tmp_path / "agencies" / "users" / "u1").exists()
