import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/projects/actions", () => ({ createProjectAction: vi.fn() }));
vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({ updateProjectAction: vi.fn() }));

import { createProjectAction } from "@/app/(app)/projects/actions";
import { updateProjectAction } from "@/app/(app)/projects/[projectId]/actions";
import ProjectForm from "./ProjectForm";

const create = vi.mocked(createProjectAction);
const update = vi.mocked(updateProjectAction);
const clients = [
  { id: "c1", name: "Acme" },
  { id: "c2", name: "Beta" },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ project: { id: "p9", name: "New" } } as never);
  update.mockResolvedValue({ project: { id: "p1", name: "New" } } as never);
});

describe("ProjectForm", () => {
  it("requires a project name", async () => {
    render(<ProjectForm agencyId="a1" clients={clients} />);
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByText("Project name is required")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("disables submit and prompts when there are no clients", () => {
    render(<ProjectForm agencyId="a1" clients={[]} />);
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Add a client first" })).toBeInTheDocument();
  });

  it("creates a project with the mapped payload", async () => {
    const onSuccess = vi.fn();
    render(<ProjectForm agencyId="a1" clients={clients} onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText("Project name"), "Website");
    await userEvent.selectOptions(screen.getByLabelText("Client"), "c2");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(create).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ name: "Website", clientId: "c2", description: null, startDate: null }),
    );
    expect(onSuccess).toHaveBeenCalledWith({ id: "p9", name: "New" });
  });

  it("maps the default hourly rate to cents", async () => {
    render(<ProjectForm agencyId="a1" clients={clients} />);
    await userEvent.type(screen.getByLabelText("Project name"), "Website");
    await userEvent.type(screen.getByLabelText("Default hourly rate"), "150.50");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(create).toHaveBeenCalledWith("a1", expect.objectContaining({ defaultHourlyRateCents: 15050 }));
  });

  it("leaves the default hourly rate null when left blank", async () => {
    render(<ProjectForm agencyId="a1" clients={clients} />);
    await userEvent.type(screen.getByLabelText("Project name"), "Website");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(create).toHaveBeenCalledWith("a1", expect.objectContaining({ defaultHourlyRateCents: null }));
  });

  it("edits an existing project and shows the success message", async () => {
    render(
      <ProjectForm
        agencyId="a1"
        clients={clients}
        project={{ id: "p1", name: "Old", client_id: "c1", status: "active", description: null } as never}
      />,
    );
    const name = screen.getByLabelText("Project name") as HTMLInputElement;
    expect(name.value).toBe("Old");
    await userEvent.clear(name);
    await userEvent.type(name, "Renamed");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(update).toHaveBeenCalledWith("a1", "p1", expect.objectContaining({ name: "Renamed" }));
    expect(await screen.findByText("Project updated.")).toBeInTheDocument();
  });

  it("surfaces a server error", async () => {
    create.mockResolvedValueOnce({ error: "Project limit reached" } as never);
    render(<ProjectForm agencyId="a1" clients={clients} />);
    await userEvent.type(screen.getByLabelText("Project name"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByText("Project limit reached")).toBeInTheDocument();
  });
});
