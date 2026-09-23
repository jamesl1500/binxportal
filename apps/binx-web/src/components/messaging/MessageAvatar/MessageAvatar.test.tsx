import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MessageAvatar, { initials, memberAvatarSrc } from "./MessageAvatar";

const member = { id: "mem1", user_id: "u1", has_avatar: true, avatar_version: "v2" } as never;

describe("MessageAvatar", () => {
  it("renders the photo when given a src", () => {
    const { container } = render(<MessageAvatar name="Ada Lovelace" src="/photo.png" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/photo.png");
  });

  it("resolves a member's photo through the agency-scoped proxy route", () => {
    expect(memberAvatarSrc("a1", member)).toBe("/api/agencies/a1/members/mem1/avatar?v=v2");
    expect(memberAvatarSrc("a1", { ...(member as object), has_avatar: false } as never)).toBeNull();
    expect(memberAvatarSrc("a1", undefined)).toBeNull();
  });

  it("falls back to initials when there is no photo", () => {
    render(<MessageAvatar name="Ada Lovelace" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("falls back to initials when the photo fails to load", () => {
    const { container } = render(<MessageAvatar name="Ada Lovelace" src="/photo.png" />);
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
