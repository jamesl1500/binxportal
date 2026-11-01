import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import UserAvatar from "./UserAvatar";

describe("UserAvatar", () => {
  it("loads the photo straight from the avatar proxy, not through /_next/image", () => {
    // The proxy needs the browser's session cookie, which the image
    // optimizer's server-side fetch wouldn't send.
    const { container } = render(
      <UserAvatar
        name="Jane Doe"
        userId="user-1"
        hasAvatar
        avatarVersion="v1"
      />,
    );
    const src = container.querySelector("img")!.getAttribute("src")!;
    expect(new URL(src, window.location.href).pathname).toBe("/api/users/me/avatar");
    const query = new URL(src, window.location.href).searchParams;
    expect(query.get("v")).toBe("v1");
    expect(query.get("u")).toBe("user-1");
  });

  it("falls back to the first-name initial when the avatar 404s", () => {
    const { container } = render(
      <UserAvatar name="jane doe" userId="user-1" hasAvatar avatarVersion="v1" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("renders fallback immediately when profile says there is no avatar", () => {
    const { container } = render(
      <UserAvatar name="Jane Doe" userId="user-1" hasAvatar={false} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("retries loading after a profile avatar version change", () => {
    const { container, rerender } = render(
      <UserAvatar name="Jane Doe" userId="user-1" hasAvatar avatarVersion="v1" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();

    rerender(
      <UserAvatar name="Jane Doe" userId="user-1" hasAvatar avatarVersion="v2" />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("v=v2"),
    );
  });

  it("shows a placeholder initial for a blank name", () => {
    render(<UserAvatar name="  " userId="user-1" hasAvatar={false} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
