import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({ updateProjectAction: vi.fn() }));

import { updateProjectAction } from "@/app/(app)/projects/[projectId]/actions";
import ProjectForm from "./ProjectForm";

const update = vi.mocked(updateProjectAction);
const clients = [
  { id: "c1", name: "Acme" },
  { id: "c2", name: "Beta" },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({ project: { id: "p1", name: "New" } } as never);
});

describe("ProjectForm", () => {
  it("requires a project name", async () => {
    const onContinue = vi.fn();
    render(<ProjectForm agencyId="a1" clients={clients} onContinue={onContinue} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Project name is required")).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("disables submit and prompts when there are no clients", () => {
    render(<ProjectForm agencyId="a1" clients={[]} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Add a client first" })).toBeInTheDocument();
  });

  it("hands the mapped details to onContinue without creating anything", async () => {
    const onContinue = vi.fn();
    render(<ProjectForm agencyId="a1" clients={clients} onContinue={onContinue} />);
    await userEvent.type(screen.getByLabelText("Project name"), "Website");
    await userEvent.selectOptions(screen.getByLabelText("Client"), "c2");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Website", clientId: "c2", description: null, startDate: null }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("maps the default hourly rate to cents", async () => {
    const onContinue = vi.fn();
    render(<ProjectForm agencyId="a1" clients={clients} onContinue={onContinue} />);
    await userEvent.type(screen.getByLabelText("Project name"), "Website");
    await userEvent.type(screen.getByLabelText("Default hourly rate"), "150.50");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ defaultHourlyRateCents: 15050 }));
  });

  it("leaves the default hourly rate null when left blank", async () => {
    const onContinue = vi.fn();
    render(<ProjectForm agencyId="a1" clients={clients} onContinue={onContinue} />);
    await userEvent.type(screen.getByLabelText("Project name"), "Website");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ defaultHourlyRateCents: null }));
  });

  it("restores initial values when stepping back to it", () => {
    render(
      <ProjectForm
        agencyId="a1"
        clients={clients}
        onContinue={vi.fn()}
        initialValues={{
          name: "Kept",
          clientId: "c2",
          status: "active",
          description: null,
          startDate: null,
          dueDate: null,
          defaultHourlyRateCents: 12000,
        }}
      />,
    );
    expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe("Kept");
    expect((screen.getByLabelText("Client") as HTMLSelectElement).value).toBe("c2");
    expect((screen.getByLabelText("Default hourly rate") as HTMLInputElement).value).toBe("120.00");
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

  it("surfaces a server error when saving an edit", async () => {
    update.mockResolvedValueOnce({ error: "Name taken" } as never);
    render(
      <ProjectForm
        agencyId="a1"
        clients={clients}
        project={{ id: "p1", name: "Old", client_id: "c1", status: "active", description: null } as never}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Name taken")).toBeInTheDocument();
  });
});
