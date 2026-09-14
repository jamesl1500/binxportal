import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AgencyMember } from "@/lib/agencies";

import MemberProfile from "./MemberProfile";

function member(overrides: Partial<AgencyMember> = {}): AgencyMember {
  return {
    id: "m-1",
    agency_id: "a-1",
    user_id: "u-1",
    role: "member",
    full_name: "Jane Doe",
    user_name: "jane",
    email: "jane@example.com",
    job_title: "Producer",
    title: null,
    phone: null,
    bio: "Loves typography.",
    is_verified: true,
    last_active_at: "2026-08-01T00:00:00Z",
    joined_at: "2026-01-01T00:00:00Z",
    admin_notes: null,
    has_avatar: false,
    avatar_version: null,
    has_cover: false,
    cover_version: null,
    skills: [],
    experience: [],
    education: [],
    ...overrides,
  };
}

describe("MemberProfile", () => {
  it("renders the name, bio, and initials avatar when there is no photo", () => {
    render(<MemberProfile agencyId="a-1" member={member()} isSelf={false} />);
    expect(screen.getByRole("heading", { name: /Jane Doe/ })).toBeInTheDocument();
    expect(screen.getByText("Loves typography.")).toBeInTheDocument();
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("shows a real avatar image, proxied through the agency-scoped route, when has_avatar is true", () => {
    // alt="" on purpose (decorative — the name is already shown as text), so
    // it's excluded from the accessible "img" role; query the DOM directly.
    const { container } = render(
      <MemberProfile
        agencyId="a-1"
        member={member({ has_avatar: true, avatar_version: "v1" })}
        isSelf={false}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/agencies/a-1/members/m-1/avatar?v=v1");
  });

  it("omits the Skills/Experience/Education sections when they're empty", () => {
    render(<MemberProfile agencyId="a-1" member={member()} isSelf={false} />);
    expect(screen.queryByRole("heading", { name: "Skills" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Experience" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Education" })).not.toBeInTheDocument();
  });

  it("renders skills as chips, and orders experience with the most recent (or 'Present') first", () => {
    render(
      <MemberProfile
        agencyId="a-1"
        member={member({
          skills: ["Python", "React"],
          experience: [
            {
              id: "exp-old",
              title: "Junior Developer",
              organization: "Old Co.",
              start_year: 2015,
              end_year: 2018,
              description: null,
            },
            {
              id: "exp-current",
              title: "Senior Developer",
              organization: "Acme Co.",
              start_year: 2021,
              end_year: null,
              description: "Leading the platform team.",
            },
          ],
        })}
        isSelf={false}
      />,
    );

    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();

    const titles = screen.getAllByText(/Developer$/).map((el) => el.textContent);
    expect(titles).toEqual(["Senior Developer", "Junior Developer"]);
    expect(screen.getByText(/2021 – Present/)).toBeInTheDocument();
  });

  it("shows 'Hidden' for phone/email the member chose not to share", () => {
    render(<MemberProfile agencyId="a-1" member={member({ email: null, phone: null })} isSelf={false} />);
    expect(screen.getAllByText("Hidden")).toHaveLength(2);
  });

  it("shows a You badge for the signed-in member's own profile", () => {
    render(<MemberProfile agencyId="a-1" member={member()} isSelf={true} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("adds a readability scrim over the cover and flags the identity block when there's a cover photo", () => {
    const { container } = render(
      <MemberProfile agencyId="a-1" member={member({ has_cover: true, cover_version: "v1" })} isSelf={false} />,
    );
    // The scrim only renders (and the name/handle only switch to light text)
    // when there's an actual photo behind them — no cover, no need for it.
    expect(container.querySelector('[data-has-cover="true"]')).toBeInTheDocument();
  });

  it("does not add the readability scrim when there's no cover photo", () => {
    const { container } = render(<MemberProfile agencyId="a-1" member={member()} isSelf={false} />);
    expect(container.querySelector('[data-has-cover="true"]')).not.toBeInTheDocument();
  });
});
