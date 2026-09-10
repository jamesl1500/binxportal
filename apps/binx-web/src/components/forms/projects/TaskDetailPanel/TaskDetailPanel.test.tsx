import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  getTaskCommentsAction: vi.fn(),
  getTaskFilesAction: vi.fn(),
  updateTaskAction: vi.fn(),
  setTaskTagsAction: vi.fn(),
  deleteTaskAction: vi.fn(),
  addTaskCommentAction: vi.fn(),
  deleteTaskCommentAction: vi.fn(),
  deleteTaskFileAction: vi.fn(),
  uploadTaskFileAction: vi.fn(),
}));

import {
  addTaskCommentAction,
  getTaskCommentsAction,
  getTaskFilesAction,
  setTaskTagsAction,
  updateTaskAction,
} from "@/app/(app)/projects/[projectId]/actions";
import type { BoardColumn, ProjectMember, ProjectTag, Task, TaskComment } from "@/lib/projects";

import TaskDetailPanel from "./TaskDetailPanel";

const mockedGetComments = vi.mocked(getTaskCommentsAction);
const mockedGetFiles = vi.mocked(getTaskFilesAction);
const mockedUpdate = vi.mocked(updateTaskAction);
const mockedSetTags = vi.mocked(setTaskTagsAction);
const mockedAddComment = vi.mocked(addTaskCommentAction);

const baseComment: TaskComment = {
  id: "comment-1",
  task_id: "task-1",
  author_type: "agency_member",
  author_user_id: "user-1",
  author_name: "Ada Lovelace",
  body: "Looks good",
  attachment: null,
  created_at: "2026-08-29T10:00:00Z",
};

const tags: ProjectTag[] = [
  { id: "tag-bug", project_id: "project-1", name: "Bug", color: "#dc2626" },
  { id: "tag-design", project_id: "project-1", name: "Design", color: "#2563eb" },
];

const columns: BoardColumn[] = [
  { id: "list-todo", project_id: "project-1", name: "To Do", position: 0, tasks: [] },
  { id: "list-doing", project_id: "project-1", name: "In Progress", position: 1, tasks: [] },
];

const projectMembers: ProjectMember[] = [
  {
    id: "member-1",
    project_id: "project-1",
    user_id: "user-1",
    full_name: "Ada Lovelace",
    email: "ada@example.com",
    job_title: null,
    role_id: null,
    role_name: null,
    role_color: null,
  },
];

const task: Task = {
  id: "task-1",
  project_id: "project-1",
  list_id: "list-todo",
  title: "Ship the landing page",
  description: "Hero, features, footer.",
  position: 0,
  due_date: null,
  assignee_id: null,
  assignee_name: null,
  comment_count: 0,
  file_count: 0,
  tags: [tags[0]],
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof TaskDetailPanel>> = {}) {
  return render(
    <TaskDetailPanel
      agencyId="agency-1"
      projectId="project-1"
      task={task}
      open
      columns={columns}
      projectMembers={projectMembers}
      projectTags={tags}
      currentUserId="user-1"
      canModerateComments={false}
      onOpenChange={vi.fn()}
      onClosed={vi.fn()}
      onMutated={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetComments.mockResolvedValue({ comments: [] });
  mockedGetFiles.mockResolvedValue({ files: [] });
});

describe("TaskDetailPanel", () => {
  it("shows details read-only by default, with no editable title field", async () => {
    renderPanel();

    expect(await screen.findByRole("heading", { name: "Ship the landing page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit details/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Task title" })).not.toBeInTheDocument();
    // The task's existing tag renders as a chip in the read-only view.
    expect(screen.getByText("Bug")).toBeInTheDocument();
  });

  it("reveals the edit form when Edit details is clicked and hides it on Cancel", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /edit details/i }));
    expect(screen.getByRole("textbox", { name: "Task title" })).toHaveValue("Ship the landing page");

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("textbox", { name: "Task title" })).not.toBeInTheDocument();
  });

  it("saves edits through updateTaskAction and returns to read-only", async () => {
    mockedUpdate.mockResolvedValueOnce({ task: { ...task, title: "Ship it" } });
    const onMutated = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onMutated });

    await user.click(screen.getByRole("button", { name: /edit details/i }));
    const titleField = screen.getByRole("textbox", { name: "Task title" });
    await user.clear(titleField);
    await user.type(titleField, "Ship it");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(mockedUpdate).toHaveBeenCalledWith(
      "agency-1",
      "project-1",
      "task-1",
      expect.objectContaining({ title: "Ship it", listId: "list-todo" }),
    );
    await waitFor(() => expect(onMutated).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
  });

  it("defaults to the Comments tab and switches to Files on click", async () => {
    const user = userEvent.setup();
    renderPanel();

    const commentsTab = screen.getByRole("tab", { name: /comments/i });
    const filesTab = screen.getByRole("tab", { name: /files/i });
    expect(commentsTab).toHaveAttribute("aria-selected", "true");
    expect(filesTab).toHaveAttribute("aria-selected", "false");

    expect(await screen.findByRole("textbox", { name: "New comment" })).toBeInTheDocument();

    await user.click(filesTab);
    expect(filesTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/attach a file/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "New comment" })).not.toBeInTheDocument();
  });

  it("renders a comment's attachment as a task-file download link", async () => {
    mockedGetComments.mockResolvedValue({
      comments: [
        {
          ...baseComment,
          attachment: {
            id: "file-9",
            task_id: "task-1",
            file_name: "mockup.png",
            mime_type: "image/png",
            size: 2048,
            uploaded_by_name: "Ada Lovelace",
            created_at: "2026-08-29T10:00:00Z",
          },
        },
      ],
    });
    renderPanel();

    const link = await screen.findByRole("link", { name: /mockup\.png/i });
    expect(link).toHaveAttribute("href", "/api/projects/agency-1/project-1/tasks/task-1/files/file-9");
  });

  it("posts a comment with an attached file through addTaskCommentAction", async () => {
    mockedAddComment.mockResolvedValueOnce({ comment: baseComment });
    const user = userEvent.setup();
    renderPanel();

    await user.type(await screen.findByRole("textbox", { name: "New comment" }), "see attached");
    const file = new File(["bytes"], "shot.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/attach a file/i), file);
    await user.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() =>
      expect(mockedAddComment).toHaveBeenCalledWith("agency-1", "project-1", "task-1", "see attached", file),
    );
  });

  it("toggles a tag from the picker in edit mode", async () => {
    mockedSetTags.mockResolvedValueOnce({ task: { ...task, tags: [tags[0], tags[1]] } });
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /edit details/i }));
    await user.click(screen.getByRole("button", { name: "Design", pressed: false }));

    expect(mockedSetTags).toHaveBeenCalledWith("agency-1", "project-1", "task-1", ["tag-bug", "tag-design"]);
  });
});
