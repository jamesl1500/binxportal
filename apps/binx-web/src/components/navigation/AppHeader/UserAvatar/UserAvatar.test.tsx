import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import UserAvatar from "./UserAvatar";

describe("UserAvatar", () => {
  it("loads the photo straight from the avatar proxy, not through /_next/image", () => {
    // The proxy needs the browser's session cookie, which the image
    // optimizer's server-side fetch wouldn't send.
    const { container } = render(<UserAvatar name="Jane Doe" />);
    const src = container.querySelector("img")!.getAttribute("src")!;
    expect(new URL(src, window.location.href).pathname).toBe("/api/users/me/avatar");
  });

  it("falls back to the first-name initial when the avatar 404s", () => {
    const { container } = render(<UserAvatar name="jane doe" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("shows a placeholder initial for a blank name", () => {
    const { container } = render(<UserAvatar name="  " />);
    fireEvent.error(container.querySelector("img")!);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
