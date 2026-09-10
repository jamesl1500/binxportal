import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockedRefresh }),
}));

vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  uploadProjectFileAction: vi.fn(),
  deleteProjectFileAction: vi.fn(),
}));

import { deleteProjectFileAction, uploadProjectFileAction } from "@/app/(app)/projects/[projectId]/actions";
import type { ProjectFile } from "@/lib/projects";

import ProjectFilesTable from "./ProjectFilesTable";

const mockedUpload = vi.mocked(uploadProjectFileAction);
const mockedDelete = vi.mocked(deleteProjectFileAction);

const files: ProjectFile[] = [
  {
    id: "file-brief",
    project_id: "project-1",
    file_name: "brief.pdf",
    mime_type: "application/pdf",
    size: 2048,
    uploaded_by_name: "Jane Doe",
    source_task_id: null,
    source_task_title: null,
    created_at: "2026-01-15T00:00:00Z",
  },
  {
    id: "file-logo",
    project_id: "project-1",
    file_name: "logo.png",
    mime_type: "image/png",
    size: 512,
    uploaded_by_name: "Ada Lovelace",
    source_task_id: null,
    source_task_title: null,
    created_at: "2026-03-01T00:00:00Z",
  },
];

const taskFile: ProjectFile = {
  id: "file-mockup",
  project_id: "project-1",
  file_name: "mockup.png",
  mime_type: "image/png",
  size: 4096,
  uploaded_by_name: "Ada Lovelace",
  source_task_id: "task-7",
  source_task_title: "Design the hero",
  created_at: "2026-04-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProjectFilesTable", () => {
  it("lists files with a human type, size, uploader, and a download link", () => {
    render(<ProjectFilesTable agencyId="agency-1" projectId="project-1" files={files} />);

    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("PNG image")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download brief.pdf" })).toHaveAttribute(
      "href",
      "/api/projects/agency-1/project-1/files/file-brief",
    );
  });

  it("shows the empty state when there are no files", () => {
    render(<ProjectFilesTable agencyId="agency-1" projectId="project-1" files={[]} />);

    expect(screen.getByText("No files yet")).toBeInTheDocument();
  });

  it("filters by search across name, type, and uploader", async () => {
    const user = userEvent.setup();
    render(<ProjectFilesTable agencyId="agency-1" projectId="project-1" files={files} />);

    await user.type(screen.getByLabelText("Search files"), "logo");

    expect(screen.getByText("logo.png")).toBeInTheDocument();
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
  });

  it("sorts by size when the Size header is clicked", async () => {
    const user = userEvent.setup();
    render(<ProjectFilesTable agencyId="agency-1" projectId="project-1" files={files} />);

    const firstFileName = () => within(screen.getAllByRole("row")[1]).getAllByRole("cell")[0].textContent;

    await user.click(screen.getByRole("button", { name: /size/i })); // desc: largest first
    expect(firstFileName()).toBe("brief.pdf");

    await user.click(screen.getByRole("button", { name: /size/i })); // asc: smallest first
    expect(firstFileName()).toBe("logo.png");
  });

  it("uploads the selected file and refreshes on success", async () => {
    mockedUpload.mockResolvedValueOnce({ file: files[0] });
    const user = userEvent.setup();
    render(<ProjectFilesTable agencyId="agency-1" projectId="project-1" files={[]} />);

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText(/upload a file/i, { selector: "input" }), file);

    expect(mockedUpload).toHaveBeenCalledWith("agency-1", "project-1", file);
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });

  it("shows the server error when upload fails", async () => {
    mockedUpload.mockResolvedValueOnce({ error: "File is too large" });
    const user = userEvent.setup();
    render(<ProjectFilesTable agencyId="agency-1" projectId="project-1" files={[]} />);

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText(/upload a file/i, { selector: "input" }), file);

    expect(await screen.findByText("File is too large")).toBeInTheDocument();
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("badges a task attachment and blocks deleting it from the project files table", async () => {
    render(<ProjectFilesTable agencyId="agency-1" projectId="project-1" files={[...files, taskFile]} />);

    expect(screen.getByText("mockup.png")).toBeInTheDocument();
    expect(screen.getByText(/Task · Design the hero/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete mockup.png" })).toBeDisabled();
  });

  it("finds a task attachment by searching the task name", async () => {
    const user = userEvent.setup();
    render(<ProjectFilesTable agencyId="agency-1" projectId="project-1" files={[...files, taskFile]} />);

    await user.type(screen.getByLabelText("Search files"), "hero");

    expect(screen.getByText("mockup.png")).toBeInTheDocument();
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
  });

  it("deletes a file after confirmation and refreshes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedDelete.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ProjectFilesTable agencyId="agency-1" projectId="project-1" files={files} />);

    await user.click(screen.getByRole("button", { name: "Delete brief.pdf" }));

    expect(mockedDelete).toHaveBeenCalledWith("agency-1", "project-1", "file-brief");
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });
});
