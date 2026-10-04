/**
 * client-onboarding.ts
 *
 * Pure derivation of the staff-facing "finish setting up this client"
 * checklist shown on a client's dashboard tab (see
 * app/(app)/clients/[clientId]/page.tsx) until it's done. Mirrors the
 * client-portal's own GettingStartedChecklist (lib/portal-insights.ts), but
 * for the agency side: today a staff member has to separately remember to
 * invite a portal contact, start a project, and send its kickoff — nothing
 * prompts the next step after the one before it. No I/O here so the rules
 * stay unit-testable without mocking the API.
 *
 * @module apps/binx-web/src/lib/client-onboarding.ts
 * @author Binx Portal
 */
export interface ClientOnboardingStep {
  id: "invite" | "project" | "kickoff";
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
}

export interface ClientOnboardingInput {
  clientId: string;
  clientName: string;
  /**
   * Whether the viewing staff member can reach the client-portal settings
   * panel at all (owners/admins only — see ClientSettingsTabs). The invite
   * step is omitted entirely for anyone else: linking them to a tab they
   * can't see would leave the step permanently stuck undone.
   */
  canManagePortal: boolean;
  /** An accepted portal contact exists for this client. */
  hasPortalContact: boolean;
  /** An invitation has been sent and hasn't been accepted or revoked yet. */
  hasPendingInvitation: boolean;
  /** The client's earliest project, if any. */
  firstProject: { id: string } | null;
  /** Whether a kickoff has been sent on that first project. */
  kickoffSent: boolean;
}

/**
 * buildClientOnboardingSteps
 *
 * The three things that turn a bare client record into one actually working
 * with the agency. The kickoff step only appears once there's a project to
 * send one on — same progressive-disclosure rule buildChecklist uses on the
 * portal side.
 */
export function buildClientOnboardingSteps({
  clientId,
  clientName,
  canManagePortal,
  hasPortalContact,
  hasPendingInvitation,
  firstProject,
  kickoffSent,
}: ClientOnboardingInput): ClientOnboardingStep[] {
  const steps: ClientOnboardingStep[] = [];

  if (canManagePortal) {
    steps.push({
      id: "invite",
      title: "Invite them to the portal",
      description: `Give ${clientName} their own login to track projects, invoices and messages.`,
      done: hasPortalContact || hasPendingInvitation,
      href: `/clients/${clientId}/settings#portal`,
      cta: hasPortalContact
        ? "Manage access"
        : hasPendingInvitation
          ? "View invite"
          : "Send invite",
    });
  }

  steps.push({
    id: "project",
    title: "Start the first project",
    description: "Projects are what the portal and your team organize work around.",
    done: firstProject !== null,
    href: firstProject
      ? `/projects/${firstProject.id}`
      : `/projects/new?clientId=${clientId}`,
    cta: firstProject ? "Open project" : "Create project",
  });

  if (firstProject) {
    steps.push({
      id: "kickoff",
      title: "Send a kickoff",
      description:
        "A short question set gets the details you need before work starts.",
      done: kickoffSent,
      href: `/projects/${firstProject.id}/kickoff`,
      cta: kickoffSent ? "View kickoff" : "Build kickoff",
    });
  }

  return steps;
}

export function isClientOnboardingComplete(
  steps: ClientOnboardingStep[],
): boolean {
  return steps.every((step) => step.done);
}
