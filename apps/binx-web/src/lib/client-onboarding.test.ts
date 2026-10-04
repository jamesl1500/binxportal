import { describe, expect, it } from "vitest";

import {
  buildClientOnboardingSteps,
  isClientOnboardingComplete,
} from "@/lib/client-onboarding";

const BASE = {
  clientId: "client-1",
  clientName: "Acme Co",
  canManagePortal: true,
  hasBranding: false,
  hasPortalContact: false,
  hasPendingInvitation: false,
  firstProject: null,
  kickoffSent: false,
} as const;

describe("buildClientOnboardingSteps", () => {
  it("leads with branding, then invite and project, none done", () => {
    const steps = buildClientOnboardingSteps(BASE);
    expect(steps.map((step) => step.id)).toEqual([
      "branding",
      "invite",
      "project",
    ]);
    expect(steps.every((step) => !step.done)).toBe(true);
    expect(steps[2].href).toBe("/projects/new?clientId=client-1");
  });

  it("marks branding done once any branding is set", () => {
    const [branding] = buildClientOnboardingSteps({
      ...BASE,
      hasBranding: true,
    });
    expect(branding.id).toBe("branding");
    expect(branding.done).toBe(true);
    expect(branding.cta).toBe("Edit branding");
  });

  it("marks invite done once a portal contact exists", () => {
    const invite = buildClientOnboardingSteps({
      ...BASE,
      hasPortalContact: true,
    }).find((step) => step.id === "invite");
    expect(invite?.done).toBe(true);
    expect(invite?.cta).toBe("Manage access");
  });

  it("marks invite done while an invitation is still pending acceptance", () => {
    const invite = buildClientOnboardingSteps({
      ...BASE,
      hasPendingInvitation: true,
    }).find((step) => step.id === "invite");
    expect(invite?.done).toBe(true);
    expect(invite?.cta).toBe("View invite");
  });

  it("omits branding and invite for staff who can't manage the client portal", () => {
    const steps = buildClientOnboardingSteps({
      ...BASE,
      canManagePortal: false,
    });
    expect(steps.map((step) => step.id)).not.toContain("branding");
    expect(steps.map((step) => step.id)).not.toContain("invite");
    expect(steps.map((step) => step.id)).toEqual(["project"]);
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
      hasBranding: true,
      hasPortalContact: true,
      firstProject: { id: "proj-1" },
      kickoffSent: true,
    });
    expect(isClientOnboardingComplete(steps)).toBe(true);
  });

  it("is true for a non-managing staff member once the remaining steps are done", () => {
    const steps = buildClientOnboardingSteps({
      ...BASE,
      canManagePortal: false,
      firstProject: { id: "proj-1" },
      kickoffSent: true,
    });
    expect(isClientOnboardingComplete(steps)).toBe(true);
  });
});
