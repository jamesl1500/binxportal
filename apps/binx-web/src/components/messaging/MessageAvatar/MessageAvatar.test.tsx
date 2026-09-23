import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MessageAvatar, { initials } from "./MessageAvatar";

const member = { id: "mem1", user_id: "u1", has_avatar: true, avatar_version: "v2" } as never;

describe("MessageAvatar", () => {
  it("renders the member's photo through the agency-scoped proxy route", () => {
    const { container } = render(<MessageAvatar agencyId="a1" name="Ada Lovelace" member={member} />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/agencies/a1/members/mem1/avatar?v=v2");
  });

  it("falls back to initials when there is no photo", () => {
    render(<MessageAvatar agencyId="a1" name="Ada Lovelace" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("falls back to initials when the photo fails to load", () => {
    const { container } = render(<MessageAvatar agencyId="a1" name="Ada Lovelace" member={member} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("builds initials from the first and last name", () => {
    expect(initials("Grace Brewster Hopper")).toBe("GH");
    expect(initials("Cher")).toBe("C");
    expect(initials("  ")).toBe("?");
  });
});
