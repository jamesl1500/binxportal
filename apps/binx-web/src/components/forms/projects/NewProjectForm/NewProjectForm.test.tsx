import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@/app/(app)/projects/actions", () => ({ createProjectAction: vi.fn() }));
// The details step is ProjectForm's own concern (see its tests) — stand in
// with a button that "continues" with fixed details.
vi.mock("@/components/forms/projects/ProjectForm/ProjectForm", () => ({
  default: ({
    onContinue,
    initialValues,
  }: {
    onContinue: (input: unknown) => void;
    initialValues?: { clientId?: string };
  }) => (
    <>
      <p data-testid="initial-client-id">{initialValues?.clientId ?? ""}</p>
      <button
        onClick={() =>
          onContinue({
            name: "Redesign",
            clientId: "c1",
            status: "planning",
            description: null,
            startDate: null,
            dueDate: null,
            defaultHourlyRateCents: null,
          })
        }
      >
        fake-details-continue
      </button>
    </>
  ),
}));
vi.mock("@/components/projects/AiTaskSetup/AiTaskSetup", () => ({
  default: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>fake-ai-done</button>,
}));

import { createProjectAction } from "@/app/(app)/projects/actions";
import NewProjectForm from "./NewProjectForm";

const create = vi.mocked(createProjectAction);

const props = {
  agencyId: "a1",
  clients: [{ id: "c1", name: "Acme" }] as never,
  agencyMembers: [
    { user_id: "me", full_name: "Me Myself", email: "me@x.com", job_title: null },
    { user_id: "u2", full_name: "Dana Designer", email: "dana@x.com", job_title: "Designer" },
  ] as never,
  currentUserId: "me",
};

const next = () => userEvent.click(screen.getByRole("button", { name: "Continue" }));

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ project: { id: "p1", name: "Redesign" } } as never);
});

describe("NewProjectForm", () => {
  it("walks every step and creates the project with its tags, roles, and team in one request", async () => {
    render(<NewProjectForm {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "fake-details-continue" }));

    // Tags: defaults pre-selected; add a custom one.
    expect(screen.getByRole("heading", { name: "Task tags" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New tag name"), "Copy review");
    await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
    await next();

    // Roles: keep the defaults.
    expect(screen.getByRole("heading", { name: "Member roles" })).toBeInTheDocument();
    await next();

    // Team: add Dana, who must get a role before continuing.
    await userEvent.selectOptions(screen.getByLabelText("Add a teammate"), "u2");
    await userEvent.click(screen.getByRole("button", { name: "Add to team" }));
    await next();
    expect(screen.getByRole("alert")).toHaveTextContent("Give everyone on the team a role.");
    await userEvent.selectOptions(screen.getByLabelText("Role for Dana Designer"), "Designer");
    await next();

    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(create).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ name: "Redesign", clientId: "c1" }),
      {
        tags: expect.arrayContaining([
          { name: "Feature", color: "#2563eb" },
          { name: "Copy review", color: "#6e6e76" },
        ]),
        roles: expect.arrayContaining([{ name: "Designer", color: "#7c3aed" }]),
        team: [
          { userId: "me", roleName: "Project Manager" },
          { userId: "u2", roleName: "Designer" },
        ],
      },
    );
    expect(await screen.findByText("Redesign is ready")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "fake-ai-done" }));
    expect(mockPush).toHaveBeenCalledWith("/projects/p1");
  });

  it("preselects the client coming from that client's own page", () => {
    render(<NewProjectForm {...props} initialClientId="c2" />);
    expect(screen.getByTestId("initial-client-id")).toHaveTextContent("c2");
  });

  it("leaves the client unselected with no initialClientId", () => {
    render(<NewProjectForm {...props} />);
    expect(screen.getByTestId("initial-client-id")).toHaveTextContent("");
  });

  it("prefers restored details over the initial client once details have been filled in", async () => {
    render(<NewProjectForm {...props} initialClientId="c2" />);
    expect(screen.getByTestId("initial-client-id")).toHaveTextContent("c2");

    // Continuing sets details.clientId to "c1" (the fake details step).
    await userEvent.click(screen.getByRole("button", { name: "fake-details-continue" }));
    await userEvent.click(screen.getByRole("button", { name: /Details/ }));

    expect(screen.getByTestId("initial-client-id")).toHaveTextContent("c1");
  });

  it("requires at least one task tag", async () => {
    render(<NewProjectForm {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "fake-details-continue" }));

    const selected = screen.getByText(/This project's tags/).parentElement!;
    for (const button of within(selected).getAllByRole("button", { name: /^Remove / })) {
      await userEvent.click(button);
    }
    await next();

    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one task tag");
    expect(screen.getByRole("heading", { name: "Task tags" })).toBeInTheDocument();
  });

  it("requires at least one role, and removing a role clears it from whoever held it", async () => {
    render(<NewProjectForm {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "fake-details-continue" }));
    await next();

    // Toggling the suggestion off removes "Project Manager" — the creator's default role.
    await userEvent.click(screen.getByRole("button", { name: "Project Manager", pressed: true }));
    await next();
    expect(screen.getByRole("heading", { name: "Team" })).toBeInTheDocument();
    expect((screen.getByLabelText("Role for Me Myself") as HTMLSelectElement).value).toBe("");

    await userEvent.click(screen.getByRole("button", { name: /Roles/ }));
    const selected = screen.getByText(/This project's roles/).parentElement!;
    for (const button of within(selected).getAllByRole("button", { name: /^Remove / })) {
      await userEvent.click(button);
    }
    await next();
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one member role.");
  });

  it("won't let a stepper jump skip a step that was emptied", async () => {
    render(<NewProjectForm {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "fake-details-continue" }));
    await next(); // tags
    await next(); // roles
    await next(); // team → review
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Task tags/ }));
    const selected = screen.getByText(/This project's tags/).parentElement!;
    for (const button of within(selected).getAllByRole("button", { name: /^Remove / })) {
      await userEvent.click(button);
    }
    await userEvent.click(screen.getByRole("button", { name: /Review/ }));

    expect(screen.getByRole("heading", { name: "Task tags" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one task tag");
  });

  it("surfaces a create error on the review step", async () => {
    create.mockResolvedValueOnce({ error: "Project limit reached" } as never);
    render(<NewProjectForm {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "fake-details-continue" }));
    await next();
    await next();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Project limit reached");
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
  });
});
