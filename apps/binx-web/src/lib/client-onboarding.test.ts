import { describe, expect, it } from "vitest";

import {
  buildClientOnboardingSteps,
  isClientOnboardingComplete,
} from "@/lib/client-onboarding";

const BASE = {
  clientId: "client-1",
  clientName: "Acme Co",
  hasPortalContact: false,
  firstProject: null,
  kickoffSent: false,
} as const;

describe("buildClientOnboardingSteps", () => {
  it("starts with invite and project steps, both not done", () => {
    const steps = buildClientOnboardingSteps(BASE);
    expect(steps.map((step) => step.id)).toEqual(["invite", "project"]);
    expect(steps.every((step) => !step.done)).toBe(true);
    expect(steps[1].href).toBe("/projects/new?clientId=client-1");
  });

  it("marks invite done once a portal contact exists", () => {
    const [invite] = buildClientOnboardingSteps({
      ...BASE,
      hasPortalContact: true,
    });
    expect(invite.done).toBe(true);
    expect(invite.cta).toBe("Manage access");
  });

  it("only shows the kickoff step once a project exists", () => {
    const withoutProject = buildClientOnboardingSteps(BASE);
    expect(withoutProject.find((step) => step.id === "kickoff")).toBeUndefined();

    const withProject = buildClientOnboardingSteps({
      ...BASE,
      firstProject: { id: "proj-1" },
    });
    const kickoff = withProject.find((step) => step.id === "kickoff");
    expect(kickoff).toBeDefined();
    expect(kickoff?.done).toBe(false);
    expect(kickoff?.href).toBe("/projects/proj-1/kickoff");

    const project = withProject.find((step) => step.id === "project");
    expect(project?.done).toBe(true);
    expect(project?.href).toBe("/projects/proj-1");
  });

  it("marks kickoff done once it's been sent", () => {
    const steps = buildClientOnboardingSteps({
      ...BASE,
      firstProject: { id: "proj-1" },
      kickoffSent: true,
    });
    expect(steps.find((step) => step.id === "kickoff")?.done).toBe(true);
  });
});

describe("isClientOnboardingComplete", () => {
  it("is false while any step is undone", () => {
    expect(isClientOnboardingComplete(buildClientOnboardingSteps(BASE))).toBe(
      false,
    );
  });

  it("is true once every listed step is done", () => {
    const steps = buildClientOnboardingSteps({
      ...BASE,
      hasPortalContact: true,
      firstProject: { id: "proj-1" },
      kickoffSent: true,
    });
    expect(isClientOnboardingComplete(steps)).toBe(true);
  });
});
