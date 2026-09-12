import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The individual panels are exercised by their own tests — stub them so this
// suite focuses on the sub-tab switching and permission gating.
vi.mock("@/components/forms/clients/ClientForm/ClientForm", () => ({
  default: () => <div>client form</div>,
}));
vi.mock("@/components/clients/PortalContactsPanel/PortalContactsPanel", () => ({
  default: () => <div>portal contacts panel</div>,
}));
vi.mock("@/components/forms/clients/ArchiveClientButton/ArchiveClientButton", () => ({
  default: () => <div>archive client button</div>,
}));
vi.mock("@/components/forms/clients/DeleteClientForm/DeleteClientForm", () => ({
  default: () => <div>delete client form</div>,
}));
vi.mock("@/components/forms/clients/ClientBrandingForm/ClientBrandingForm", () => ({
  default: () => <div>client branding form</div>,
}));

import type { AgencyClient, ClientBranding, ClientContact, ClientContactInvitation } from "@/lib/clients";

import ClientSettingsTabs from "./ClientSettingsTabs";

const client = { id: "client-1", name: "Fjord & Field", is_active: true } as AgencyClient;
const contacts: ClientContact[] = [];
const invitations: ClientContactInvitation[] = [];
const branding = { client_id: "client-1", primary_color: null, accent_color: null, welcome_message: null, has_logo: false, logo_version: null } as ClientBranding;

function renderTabs(
  overrides: Partial<{ canManage: boolean; canDelete: boolean; branding: ClientBranding | null }> = {},
) {
  return render(
    <ClientSettingsTabs
      agencyId="agency-1"
      client={client}
      canManage={overrides.canManage ?? true}
      canDelete={overrides.canDelete ?? true}
      contacts={contacts}
      invitations={invitations}
      branding={overrides.branding === undefined ? branding : overrides.branding}
    />,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/clients/client-1/settings");
});

describe("ClientSettingsTabs", () => {
  it("shows the Details panel by default", () => {
    renderTabs();

    expect(screen.getByText("client form")).toBeInTheDocument();
    expect(screen.queryByText("portal contacts panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute("aria-current", "page");
  });

  it("switches panels when a nav item is clicked and reflects it in the hash", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("button", { name: "Client portal" }));

    expect(screen.getByText("portal contacts panel")).toBeInTheDocument();
    expect(screen.queryByText("client form")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#portal");
  });

  it("shows the branding panel", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("button", { name: "Branding" }));

    expect(screen.getByText("client branding form")).toBeInTheDocument();
    expect(window.location.hash).toBe("#branding");
  });

  it("shows the danger zone panel with the delete form", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("button", { name: "Danger zone" }));

    expect(screen.getByText("delete client form")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
  });

  it("opens on the section named by the URL hash", () => {
    window.history.replaceState(null, "", "/clients/client-1/settings#status");
    renderTabs();

    expect(screen.getByText("archive client button")).toBeInTheDocument();
  });

  it("hides the Client portal, Branding, and Danger zone tabs for a non-manager", () => {
    renderTabs({ canManage: false, canDelete: false, branding: null });

    expect(screen.queryByRole("button", { name: "Client portal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Branding" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Danger zone" })).not.toBeInTheDocument();
  });

  it("falls back to Details when the hash names a section hidden from this viewer", () => {
    window.history.replaceState(null, "", "/clients/client-1/settings#danger");
    renderTabs({ canManage: false, canDelete: false });

    expect(screen.getByText("client form")).toBeInTheDocument();
  });
});
