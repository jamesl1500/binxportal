"""
Integration tests for file handling in ``binx_api.modules.projects.service``:

* project-level files (``save_project_file`` / ``delete_project_file``)
* task-level files (``save_task_file`` / ``delete_task_file``)
* task **comment** attachments (``add_task_comment`` with a file /
  ``delete_task_comment``)
* the mirroring rule — every task attachment also shows up in the project's
  Files list, shares its bytes on disk, and can't be deleted from the project
  side.

``project_upload_dir`` is redirected to a per-test ``tmp_path`` so nothing
touches the real ``uploads/`` tree.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.agencies.models import ROLE_MEMBER
from binx_api.modules.projects import service
from binx_api.modules.projects.models import ProjectFile, ProjectTaskFile
from tests.factories import make_agency, make_client, make_project, make_task, make_user

pytestmark = pytest.mark.integration

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"fake image payload"


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    """Point every ``storage_path`` at a throwaway directory."""
    monkeypatch.setattr(service.settings, "project_upload_dir", str(tmp_path))
    return tmp_path


@pytest.fixture
async def project_ctx(db_session):
    owner = await make_user(db_session)
    agency = await make_agency(db_session, owner=owner)
    client = await make_client(db_session, agency=agency)
    project = await make_project(db_session, agency=agency, created_by=owner, client=client)
    return owner, project


class TestProjectFiles:
    async def test_saves_bytes_to_disk_and_records_metadata(
        self, db_session, project_ctx, _isolated_upload_dir
    ) -> None:
        owner, project = project_ctx
        record = await service.save_project_file(
            db_session,
            project,
            uploaded_by=owner,
            file_name="brief.pdf",
            content=b"pdf-bytes",
            mime_type="application/pdf",
        )
        assert record.size == len(b"pdf-bytes")
        assert record.source_task_file_id is None
        from pathlib import Path

        assert Path(record.storage_path).read_bytes() == b"pdf-bytes"

    async def test_rejects_a_file_over_the_size_cap(self, db_session, project_ctx, monkeypatch) -> None:
        owner, project = project_ctx
        monkeypatch.setattr(service.settings, "project_upload_max_bytes", 10)
        with pytest.raises(HTTPException) as exc:
            await service.save_project_file(
                db_session,
                project,
                uploaded_by=owner,
                file_name="big.bin",
                content=b"x" * 11,
                mime_type="application/octet-stream",
            )
        assert exc.value.status_code == 413

    async def test_delete_removes_the_record_and_the_bytes(self, db_session, project_ctx) -> None:
        from pathlib import Path

        owner, project = project_ctx
        record = await service.save_project_file(
            db_session, project, uploaded_by=owner, file_name="x.txt", content=b"data", mime_type="text/plain"
        )
        path = Path(record.storage_path)
        assert path.exists()

        await service.delete_project_file(db_session, record)
        assert not path.exists()

    async def test_list_returns_uploader_name(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        await service.save_project_file(
            db_session, project, uploaded_by=owner, file_name="x.txt", content=b"data", mime_type="text/plain"
        )
        rows = await service.list_project_files(db_session, project.id)
        assert len(rows) == 1
        _file, uploader_name, source_task_id, source_task_title = rows[0]
        assert uploader_name == owner.full_name
        assert source_task_id is None and source_task_title is None


class TestTaskFiles:
    async def test_rejects_a_disallowed_mime_type(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        task = await make_task(db_session, project=project)
        with pytest.raises(HTTPException) as exc:
            await service.save_task_file(
                db_session, task, uploaded_by=owner, file_name="notes.txt", content=b"text", mime_type="text/plain"
            )
        assert exc.value.status_code == 415

    async def test_accepts_an_image(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        task = await make_task(db_session, project=project)
        record = await service.save_task_file(
            db_session, task, uploaded_by=owner, file_name="shot.png", content=PNG_BYTES, mime_type="image/png"
        )
        assert record.task_id == task.id


class TestCommentAttachments:
    # A comment's attachment IS a task file: it lands in project_task_files
    # (and is therefore mirrored into project_files like every other task
    # attachment). add_task_comment returns (comment, ProjectTaskFile | None);
    # list_task_comments returns (comment, file, uploader_name) triples.

    async def test_comment_attachment_is_a_task_file_and_a_project_file(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        task = await make_task(db_session, project=project, title="Homepage")

        comment, attachment = await service.add_task_comment(
            db_session,
            task,
            author=owner,
            body="see attached",
            attachment_file_name="mock.png",
            attachment_content=PNG_BYTES,
            attachment_mime_type="image/png",
        )

        assert attachment is not None
        assert isinstance(attachment, ProjectTaskFile)
        assert comment.attachment == attachment.id
        assert attachment.task_id == task.id
        assert Path(attachment.storage_path).read_bytes() == PNG_BYTES

        # Shows on the task's Files list...
        task_files = await service.list_task_files(db_session, task.id)
        assert [f.id for f, _uploader in task_files] == [attachment.id]

        # ...and, via the task-file mirror, on the project-wide Files list.
        project_files = await service.list_project_files(db_session, project.id)
        assert len(project_files) == 1
        mirror, uploader_name, source_task_id, _title = project_files[0]
        assert mirror.file_name == "mock.png"
        assert mirror.source_task_file_id == attachment.id
        assert uploader_name == owner.full_name
        assert source_task_id == task.id

        # And it comes back joined onto the comment listing.
        [(listed_comment, listed_file, listed_uploader)] = await service.list_task_comments(db_session, task.id)
        assert listed_comment.id == comment.id
        assert listed_file is not None and listed_file.file_name == "mock.png"
        assert listed_uploader == owner.full_name

    async def test_a_text_only_comment_has_no_attachment(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        task = await make_task(db_session, project=project)
        comment, attachment = await service.add_task_comment(db_session, task, author=owner, body="just text")
        assert attachment is None and comment.attachment is None
        assert await service.list_project_files(db_session, project.id) == []

    async def test_disallowed_type_is_rejected_and_no_comment_is_left_behind(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        task = await make_task(db_session, project=project)
        with pytest.raises(HTTPException) as exc:
            await service.add_task_comment(
                db_session,
                task,
                author=owner,
                body="nope",
                attachment_file_name="notes.txt",
                attachment_content=b"plain text",
                attachment_mime_type="text/plain",
            )
        assert exc.value.status_code == 415
        assert await service.list_task_comments(db_session, task.id) == []

    async def test_deleting_the_comment_removes_the_file_and_mirror(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        task = await make_task(db_session, project=project)
        comment, attachment = await service.add_task_comment(
            db_session,
            task,
            author=owner,
            body="bye",
            attachment_file_name="mock.png",
            attachment_content=PNG_BYTES,
            attachment_mime_type="image/png",
        )
        stored = Path(attachment.storage_path)
        assert stored.exists()

        await service.delete_task_comment(db_session, comment, requested_by=owner, requester_role=ROLE_MEMBER)

        assert not stored.exists()
        assert (await db_session.execute(select(ProjectTaskFile))).scalars().all() == []
        assert (await db_session.execute(select(ProjectFile))).scalars().all() == []


class TestTaskFileMirroring:
    async def test_a_task_upload_also_appears_in_the_project_files_list(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        task = await make_task(db_session, project=project, title="Design the hero")
        await service.save_task_file(
            db_session, task, uploaded_by=owner, file_name="hero.png", content=PNG_BYTES, mime_type="image/png"
        )

        rows = await service.list_project_files(db_session, project.id)
        assert len(rows) == 1
        mirror, uploader_name, source_task_id, source_task_title = rows[0]
        assert mirror.file_name == "hero.png"
        assert mirror.source_task_file_id is not None
        assert uploader_name == owner.full_name
        assert source_task_id == task.id
        assert source_task_title == "Design the hero"

    async def test_the_mirror_shares_the_same_bytes_on_disk(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        task = await make_task(db_session, project=project)
        task_file = await service.save_task_file(
            db_session, task, uploaded_by=owner, file_name="a.png", content=PNG_BYTES, mime_type="image/png"
        )
        mirror = (
            await db_session.execute(select(ProjectFile).where(ProjectFile.source_task_file_id == task_file.id))
        ).scalar_one()
        assert mirror.storage_path == task_file.storage_path

    async def test_the_mirror_cannot_be_deleted_from_the_project_side(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        task = await make_task(db_session, project=project)
        await service.save_task_file(
            db_session, task, uploaded_by=owner, file_name="a.png", content=PNG_BYTES, mime_type="image/png"
        )
        mirror = (await db_session.execute(select(ProjectFile))).scalar_one()

        with pytest.raises(HTTPException) as exc:
            await service.delete_project_file(db_session, mirror)
        assert exc.value.status_code == 409

    async def test_deleting_the_task_file_removes_the_mirror_and_the_bytes(self, db_session, project_ctx) -> None:
        from pathlib import Path

        owner, project = project_ctx
        task = await make_task(db_session, project=project)
        task_file = await service.save_task_file(
            db_session, task, uploaded_by=owner, file_name="a.png", content=PNG_BYTES, mime_type="image/png"
        )
        path = Path(task_file.storage_path)

        await service.delete_task_file(db_session, task_file)

        assert not path.exists()
        assert (await db_session.execute(select(ProjectFile))).scalars().all() == []

    async def test_deleting_the_task_cascades_through_to_the_mirror(self, db_session, project_ctx) -> None:
        owner, project = project_ctx
        task = await make_task(db_session, project=project)
        await service.save_task_file(
            db_session, task, uploaded_by=owner, file_name="a.png", content=PNG_BYTES, mime_type="image/png"
        )
        assert len((await db_session.execute(select(ProjectFile))).scalars().all()) == 1

        await service.delete_task(db_session, task)
        assert (await db_session.execute(select(ProjectFile))).scalars().all() == []
