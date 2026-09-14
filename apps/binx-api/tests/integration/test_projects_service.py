"""
Integration tests for ``binx_api.modules.projects.service`` — everything
except the file-mirroring behaviour, which has its own module
(``test_project_files_service.py``).

Grouped by concern: project creation, team membership + custom roles, tags,
the kanban board (lists, tasks, moves), and task comments.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, AgencyMember
from binx_api.modules.projects import service
from binx_api.modules.projects.models import (
    DEFAULT_TASK_LISTS,
    ProjectMember,
    ProjectTask,
    ProjectTaskList,
)
from tests.factories import (
    first_list,
    make_agency,
    make_client,
    make_project,
    make_task,
    make_user,
)

pytestmark = pytest.mark.integration


@pytest.fixture
async def project_ctx(db_session):
    """A ready-to-use (owner, agency, client, project) tuple — the starting
    point for almost every test in this module."""
    owner = await make_user(db_session)
    agency = await make_agency(db_session, owner=owner)
    client = await make_client(db_session, agency=agency)
    project = await make_project(db_session, agency=agency, created_by=owner, client=client)
    return owner, agency, client, project


class TestCreateProject:
    async def test_seeds_the_default_kanban_columns(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        lists = (
            (
                await db_session.execute(
                    select(ProjectTaskList)
                    .where(ProjectTaskList.project_id == project.id)
                    .order_by(ProjectTaskList.position)
                )
            )
            .scalars()
            .all()
        )
        assert [lst.name for lst in lists] == DEFAULT_TASK_LISTS
        assert [lst.position for lst in lists] == [0, 1, 2]

    async def test_adds_the_creator_as_a_member(self, db_session, project_ctx) -> None:
        owner, _agency, _client, project = project_ctx
        members = (
            (await db_session.execute(select(ProjectMember).where(ProjectMember.project_id == project.id)))
            .scalars()
            .all()
        )
        assert [m.user_id for m in members] == [owner.id]

    async def test_generates_a_slug_unique_within_the_agency(self, db_session, project_ctx) -> None:
        owner, agency, client, _project = project_ctx
        a = await make_project(db_session, agency=agency, created_by=owner, client=client, name="Redesign")
        b = await make_project(db_session, agency=agency, created_by=owner, client=client, name="Redesign")
        assert a.slug == "redesign"
        assert b.slug == "redesign-2"

    async def test_rejects_a_client_from_another_agency(self, db_session) -> None:
        owner = await make_user(db_session)
        agency_a = await make_agency(db_session, owner=owner, name="Agency A")
        agency_b = await make_agency(db_session, owner=owner, name="Agency B")
        foreign_client = await make_client(db_session, agency=agency_b)

        with pytest.raises(HTTPException) as exc:
            await service.create_project(
                db_session,
                agency_a,
                created_by=owner,
                client_id=foreign_client.id,
                name="Nope",
                description=None,
                status_="planning",
                start_date=None,
                due_date=None,
            )
        assert exc.value.status_code == 404


class TestProjectMembersAndRoles:
    async def test_add_member_requires_agency_membership(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        outsider = await make_user(db_session)
        with pytest.raises(HTTPException) as exc:
            await service.add_project_member(db_session, project, user_id=outsider.id)
        assert exc.value.status_code == 400

    async def test_add_member_rejects_someone_already_on_the_project(self, db_session, project_ctx) -> None:
        owner, agency, _client, project = project_ctx
        teammate = await make_user(db_session)
        db_session.add(AgencyMember(agency_id=agency.id, user_id=teammate.id, role=ROLE_MEMBER))
        await db_session.commit()

        await service.add_project_member(db_session, project, user_id=teammate.id)
        with pytest.raises(HTTPException) as exc:
            await service.add_project_member(db_session, project, user_id=teammate.id)
        assert exc.value.status_code == 409

    async def test_roles_are_unique_per_project_by_name(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        await service.create_project_role(db_session, project, name="Project Manager", color="#2563eb")
        with pytest.raises(HTTPException) as exc:
            await service.create_project_role(db_session, project, name="Project Manager", color="#16a34a")
        assert exc.value.status_code == 409

    async def test_roles_list_alphabetically(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        await service.create_project_role(db_session, project, name="Web Developer", color="#111111")
        await service.create_project_role(db_session, project, name="Designer", color="#222222")
        roles = await service.list_project_roles(db_session, project.id)
        assert [r.name for r in roles] == ["Designer", "Web Developer"]

    async def test_assign_and_clear_a_member_role(self, db_session, project_ctx) -> None:
        owner, _agency, _client, project = project_ctx
        role = await service.create_project_role(db_session, project, name="Lead", color="#333333")
        member = (
            await db_session.execute(
                select(ProjectMember).where(ProjectMember.project_id == project.id, ProjectMember.user_id == owner.id)
            )
        ).scalar_one()

        await service.assign_member_role(db_session, member, role_id=role.id)
        assert member.role_id == role.id
        await service.assign_member_role(db_session, member, role_id=None)
        assert member.role_id is None

    async def test_assign_rejects_a_role_from_another_project(self, db_session, project_ctx) -> None:
        owner, agency, client, project = project_ctx
        other_project = await make_project(db_session, agency=agency, created_by=owner, client=client, name="Other")
        foreign_role = await service.create_project_role(db_session, other_project, name="Foreign", color="#444444")
        member = (
            await db_session.execute(select(ProjectMember).where(ProjectMember.project_id == project.id))
        ).scalar_one()

        with pytest.raises(HTTPException) as exc:
            await service.assign_member_role(db_session, member, role_id=foreign_role.id)
        assert exc.value.status_code == 404

    async def test_deleting_a_role_clears_it_from_members_but_keeps_the_membership(
        self, db_session, project_ctx
    ) -> None:
        owner, _agency, _client, project = project_ctx
        role = await service.create_project_role(db_session, project, name="Temp", color="#555555")
        member = (
            await db_session.execute(select(ProjectMember).where(ProjectMember.project_id == project.id))
        ).scalar_one()
        await service.assign_member_role(db_session, member, role_id=role.id)

        await service.delete_project_role(db_session, role)
        await db_session.refresh(member)
        assert member.role_id is None  # SET NULL
        assert (await db_session.get(ProjectMember, member.id)) is not None  # still assigned


class TestTags:
    async def test_tags_are_unique_per_project_and_listed_alphabetically(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        project_id = project.id  # the duplicate-name insert below rolls the session back, expiring `project`
        await service.create_project_tag(db_session, project, name="Urgent", color="#dc2626")
        await service.create_project_tag(db_session, project, name="Bug", color="#ea580c")
        with pytest.raises(HTTPException):
            await service.create_project_tag(db_session, project, name="Bug", color="#000000")

        tags = await service.list_project_tags(db_session, project_id)
        assert [t.name for t in tags] == ["Bug", "Urgent"]

    async def test_set_task_tags_is_a_full_replace(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        task = await make_task(db_session, project=project)
        bug = await service.create_project_tag(db_session, project, name="Bug", color="#dc2626")
        design = await service.create_project_tag(db_session, project, name="Design", color="#2563eb")

        await service.set_task_tags(db_session, task, tag_ids=[bug.id, design.id])
        assert {t.name for t in await service.get_task_tags(db_session, task.id)} == {"Bug", "Design"}

        await service.set_task_tags(db_session, task, tag_ids=[design.id])
        assert [t.name for t in await service.get_task_tags(db_session, task.id)] == ["Design"]

    async def test_set_task_tags_rejects_a_tag_from_another_project(self, db_session, project_ctx) -> None:
        owner, agency, client, project = project_ctx
        other = await make_project(db_session, agency=agency, created_by=owner, client=client, name="Other")
        foreign_tag = await service.create_project_tag(db_session, other, name="Foreign", color="#000000")
        task = await make_task(db_session, project=project)

        with pytest.raises(HTTPException) as exc:
            await service.set_task_tags(db_session, task, tag_ids=[foreign_tag.id])
        assert exc.value.status_code == 404

    async def test_deleting_a_tag_unlinks_it_from_tasks(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        task = await make_task(db_session, project=project)
        tag = await service.create_project_tag(db_session, project, name="Temp", color="#999999")
        await service.set_task_tags(db_session, task, tag_ids=[tag.id])

        await service.delete_project_tag(db_session, tag)
        assert await service.get_task_tags(db_session, task.id) == []


class TestTaskLists:
    async def test_new_list_lands_at_the_right_hand_end(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        added = await service.create_task_list(db_session, project, name="Review")
        assert added.position == 3  # after To Do / In Progress / Done

    async def test_cannot_delete_a_list_that_still_has_cards(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        todo = await first_list(db_session, project)
        await make_task(db_session, project=project, task_list=todo)

        with pytest.raises(HTTPException) as exc:
            await service.delete_task_list(db_session, todo)
        assert exc.value.status_code == 409

    async def test_cannot_delete_the_last_list(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        board = await service.get_project_board(db_session, project.id)
        # Remove the two empty trailing columns, leaving one.
        await service.delete_task_list(db_session, board[2][0])
        await service.delete_task_list(db_session, board[1][0])

        with pytest.raises(HTTPException) as exc:
            await service.delete_task_list(db_session, board[0][0])
        assert exc.value.status_code == 409

    async def test_move_task_list_reindexes_the_board(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        board = await service.get_project_board(db_session, project.id)
        todo, doing, done = board[0][0], board[1][0], board[2][0]

        # Drag "Done" to the front.
        await service.move_task_list(db_session, done, position=0)

        await db_session.refresh(todo)
        await db_session.refresh(doing)
        await db_session.refresh(done)
        assert done.position == 0
        assert (todo.position, doing.position) == (1, 2)

    async def test_move_task_list_clamps_an_out_of_range_position(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        board = await service.get_project_board(db_session, project.id)
        todo, doing, done = board[0][0], board[1][0], board[2][0]

        await service.move_task_list(db_session, todo, position=99)

        await db_session.refresh(todo)
        await db_session.refresh(doing)
        await db_session.refresh(done)
        assert todo.position == 2  # pushed to the end, not left out of range
        assert (doing.position, done.position) == (0, 1)


class TestBulkCreateBoard:
    async def test_appends_lists_and_tasks_after_the_defaults_in_one_commit(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        from binx_api.modules.ai.service import TaskListSuggestion, TaskSuggestion

        await service.bulk_create_board(
            db_session,
            project,
            lists=[
                TaskListSuggestion(
                    name="Discovery",
                    tasks=[
                        TaskSuggestion(title="Kickoff call", description="Align on scope."),
                        TaskSuggestion(title="Gather assets", description=None),
                    ],
                ),
                TaskListSuggestion(name="Design", tasks=[TaskSuggestion(title="Moodboard", description=None)]),
            ],
        )

        lists = (
            (
                await db_session.execute(
                    select(ProjectTaskList)
                    .where(ProjectTaskList.project_id == project.id)
                    .order_by(ProjectTaskList.position)
                )
            )
            .scalars()
            .all()
        )
        assert [lst.name for lst in lists] == [*DEFAULT_TASK_LISTS, "Discovery", "Design"]

        discovery = lists[3]
        tasks = (
            (
                await db_session.execute(
                    select(ProjectTask).where(ProjectTask.list_id == discovery.id).order_by(ProjectTask.position)
                )
            )
            .scalars()
            .all()
        )
        assert [t.title for t in tasks] == ["Kickoff call", "Gather assets"]
        assert tasks[0].description == "Align on scope."
        assert tasks[0].position == 0
        assert tasks[1].position == 1

    async def test_empty_suggestion_list_is_a_no_op(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        await service.bulk_create_board(db_session, project, lists=[])

        lists = (
            (await db_session.execute(select(ProjectTaskList).where(ProjectTaskList.project_id == project.id)))
            .scalars()
            .all()
        )
        assert [lst.name for lst in lists] == DEFAULT_TASK_LISTS


class TestTasks:
    async def test_create_task_appends_to_the_bottom_of_the_column(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        todo = await first_list(db_session, project)
        a = await make_task(db_session, project=project, task_list=todo, title="A")
        b = await make_task(db_session, project=project, task_list=todo, title="B")
        assert (a.position, b.position) == (0, 1)

    async def test_update_moving_between_columns_reassigns_position(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        board = await service.get_project_board(db_session, project.id)
        todo, doing = board[0][0], board[1][0]
        await make_task(db_session, project=project, task_list=doing, title="already here")
        task = await make_task(db_session, project=project, task_list=todo, title="mover")

        updated = await service.update_task(
            db_session, task, list_id=doing.id, title="mover", description=None, due_date=None, assignee_id=None
        )
        assert updated.list_id == doing.id
        assert updated.position == 1  # after the card already in "doing"

    async def test_move_task_reindexes_both_columns(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        board = await service.get_project_board(db_session, project.id)
        todo, doing = board[0][0], board[1][0]
        t0 = await make_task(db_session, project=project, task_list=todo, title="t0")
        t1 = await make_task(db_session, project=project, task_list=todo, title="t1")
        t2 = await make_task(db_session, project=project, task_list=todo, title="t2")

        # Move the middle card to the top of "doing".
        await service.move_task(db_session, t1, list_id=doing.id, position=0)

        await db_session.refresh(t0)
        await db_session.refresh(t2)
        assert (t0.position, t2.position) == (0, 1)  # gap closed in the source column
        await db_session.refresh(t1)
        assert t1.list_id == doing.id and t1.position == 0

    async def test_move_task_clamps_an_out_of_range_position(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        board = await service.get_project_board(db_session, project.id)
        todo = board[0][0]
        a = await make_task(db_session, project=project, task_list=todo, title="a")
        b = await make_task(db_session, project=project, task_list=todo, title="b")

        await service.move_task(db_session, a, list_id=todo.id, position=99)
        await db_session.refresh(a)
        await db_session.refresh(b)
        assert {a.position, b.position} == {0, 1}
        assert b.position == 0  # a pushed to the end

    async def test_delete_task_closes_the_positional_gap(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        todo = await first_list(db_session, project)
        a = await make_task(db_session, project=project, task_list=todo, title="a")
        b = await make_task(db_session, project=project, task_list=todo, title="b")
        c = await make_task(db_session, project=project, task_list=todo, title="c")

        await service.delete_task(db_session, b)
        await db_session.refresh(a)
        await db_session.refresh(c)
        assert (a.position, c.position) == (0, 1)

    async def test_assignee_must_be_an_agency_member(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        todo = await first_list(db_session, project)
        outsider = await make_user(db_session)
        with pytest.raises(HTTPException) as exc:
            await service.create_task(
                db_session,
                project,
                list_id=todo.id,
                title="x",
                description=None,
                due_date=None,
                assignee_id=outsider.id,
            )
        assert exc.value.status_code == 400

    async def test_deleting_a_project_cascades_to_its_tasks_and_lists(self, db_session, project_ctx) -> None:
        _owner, _agency, _client, project = project_ctx
        await make_task(db_session, project=project)
        project_id = project.id

        await service.delete_project(db_session, project)

        assert (
            await db_session.execute(
                select(func.count()).select_from(ProjectTask).where(ProjectTask.project_id == project_id)
            )
        ).scalar_one() == 0
        assert (
            await db_session.execute(
                select(func.count()).select_from(ProjectTaskList).where(ProjectTaskList.project_id == project_id)
            )
        ).scalar_one() == 0


class TestComments:
    # add_task_comment returns (comment, attachment); list_task_comments
    # returns (comment, attachment, uploader_name) triples. attachment is None
    # for a text-only comment. File-carrying comments are covered in
    # test_project_files_service.py (that module has the isolated upload dir).

    async def test_add_comment_snapshots_the_author_name(self, db_session, project_ctx) -> None:
        owner, _agency, _client, project = project_ctx
        task = await make_task(db_session, project=project)
        comment, attachment = await service.add_task_comment(db_session, task, author=owner, body="First!")
        assert comment.author_name == owner.full_name
        assert comment.author_user_id == owner.id
        assert attachment is None

    async def test_comments_come_back_oldest_first(self, db_session, project_ctx) -> None:
        owner, _agency, _client, project = project_ctx
        task = await make_task(db_session, project=project)
        await service.add_task_comment(db_session, task, author=owner, body="one")
        await service.add_task_comment(db_session, task, author=owner, body="two")
        bodies = [c.body for c, _attachment, _uploader in await service.list_task_comments(db_session, task.id)]
        assert bodies == ["one", "two"]

    async def test_author_can_delete_their_own_comment(self, db_session, project_ctx) -> None:
        owner, _agency, _client, project = project_ctx
        task = await make_task(db_session, project=project)
        comment, _attachment = await service.add_task_comment(db_session, task, author=owner, body="mine")
        await service.delete_task_comment(db_session, comment, requested_by=owner, requester_role=ROLE_MEMBER)
        assert await service.list_task_comments(db_session, task.id) == []

    async def test_non_author_member_cannot_delete_someone_elses_comment(self, db_session, project_ctx) -> None:
        owner, _agency, _client, project = project_ctx
        other = await make_user(db_session)
        task = await make_task(db_session, project=project)
        comment, _attachment = await service.add_task_comment(db_session, task, author=owner, body="theirs")

        with pytest.raises(HTTPException) as exc:
            await service.delete_task_comment(db_session, comment, requested_by=other, requester_role=ROLE_MEMBER)
        assert exc.value.status_code == 403

    async def test_admin_can_moderate_anyone_elses_comment(self, db_session, project_ctx) -> None:
        owner, _agency, _client, project = project_ctx
        moderator = await make_user(db_session)
        task = await make_task(db_session, project=project)
        comment, _attachment = await service.add_task_comment(db_session, task, author=owner, body="moderated")

        await service.delete_task_comment(db_session, comment, requested_by=moderator, requester_role=ROLE_ADMIN)
        assert await service.list_task_comments(db_session, task.id) == []

    async def test_task_counts_track_comments_and_files(self, db_session, project_ctx) -> None:
        owner, _agency, _client, project = project_ctx
        task = await make_task(db_session, project=project)
        assert await service.get_task_counts(db_session, task.id) == (0, 0)
        await service.add_task_comment(db_session, task, author=owner, body="c")
        assert await service.get_task_counts(db_session, task.id) == (1, 0)
