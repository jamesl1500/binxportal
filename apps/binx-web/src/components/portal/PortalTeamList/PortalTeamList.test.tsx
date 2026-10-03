import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PortalTeamMember } from "@/lib/portal";

import PortalTeamList from "./PortalTeamList";

function makeMember(overrides: Partial<PortalTeamMember>): PortalTeamMember {
  return {
    user_id: "u1",
    full_name: "Morgan Lee",
    job_title: "Lead Designer",
    email: "morgan@agency.example",
    phone: null,
    has_avatar: false,
    avatar_version: null,
    projects: [
      { id: "p1", name: "Rebrand", role_name: "Project Manager", role_color: "#2563eb" },
    ],
    ...overrides,
  };
}

describe("PortalTeamList", () => {
  it("shows each member's name, job title, projects and roles", () => {
    render(
      <PortalTeamList
        members={[
          makeMember({}),
          makeMember({
            user_id: "u2",
            full_name: "Riley Park",
            job_title: null,
            projects: [
              { id: "p1", name: "Rebrand", role_name: null, role_color: null },
              { id: "p2", name: "Website", role_name: "Developer", role_color: null },
            ],
          }),
        ]}
      />,
    );

    const cards = screen.getAllByRole("listitem").filter((li) => within(li).queryByRole("heading"));
    expect(cards).toHaveLength(2);

    expect(within(cards[0]).getByRole("heading", { name: "Morgan Lee" })).toBeInTheDocument();
    expect(within(cards[0]).getByText("Lead Designer")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Project Manager")).toBeInTheDocument();
    expect(within(cards[0]).getByRole("link", { name: "Rebrand" })).toHaveAttribute("href", "/portal/projects/p1");

    expect(within(cards[1]).getByRole("link", { name: "Website" })).toHaveAttribute("href", "/portal/projects/p2");
    expect(within(cards[1]).getByText("Developer")).toBeInTheDocument();
  });

  it("links the shared email and phone", () => {
    render(<PortalTeamList members={[makeMember({ phone: "+1 555 0100" })]} />);

    expect(screen.getByRole("link", { name: "morgan@agency.example" })).toHaveAttribute(
      "href",
      "mailto:morgan@agency.example",
    );
    expect(screen.getByRole("link", { name: "+1 555 0100" })).toHaveAttribute("href", "tel:+1 555 0100");
    expect(screen.queryByRole("link", { name: "Reach them in Messages" })).not.toBeInTheDocument();
  });

  it("points to Messages when a member shares no contact details", () => {
    render(<PortalTeamList members={[makeMember({ email: null, phone: null })]} />);

    expect(screen.getByRole("link", { name: "Reach them in Messages" })).toHaveAttribute("href", "/portal/messages");
  });

  it("uses the team avatar route when a member has a photo", () => {
    const { container } = render(
      <PortalTeamList members={[makeMember({ has_avatar: true, avatar_version: "v1" })]} />,
    );

    expect(container.querySelector("img")).toHaveAttribute("src", "/api/portal/team/u1/avatar?v=v1");
  });
});
