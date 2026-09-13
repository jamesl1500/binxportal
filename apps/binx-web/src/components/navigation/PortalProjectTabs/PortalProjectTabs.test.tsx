import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from "next/navigation";

import PortalProjectTabs from "./PortalProjectTabs";

const mockedUsePathname = vi.mocked(usePathname);

const projectId = "11111111-1111-1111-1111-111111111111";

describe("PortalProjectTabs", () => {
  it("links to the overview, board, and canvas pages", () => {
    mockedUsePathname.mockReturnValue(`/portal/projects/${projectId}`);
    render(<PortalProjectTabs projectId={projectId} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", `/portal/projects/${projectId}`);
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute(
      "href",
      `/portal/projects/${projectId}/board`,
    );
    expect(screen.getByRole("link", { name: "Canvas" })).toHaveAttribute(
      "href",
      `/portal/projects/${projectId}/canvas`,
    );
  });

  it("does not render staff-only tabs", () => {
    mockedUsePathname.mockReturnValue(`/portal/projects/${projectId}`);
    render(<PortalProjectTabs projectId={projectId} />);
    for (const label of [/team/i, /files/i, /settings/i]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  it("marks the overview tab active on the base project path", () => {
    mockedUsePathname.mockReturnValue(`/portal/projects/${projectId}`);
    render(<PortalProjectTabs projectId={projectId} />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Canvas" })).toHaveAttribute("data-active", "false");
  });

  it("marks the board tab active on the board path", () => {
    mockedUsePathname.mockReturnValue(`/portal/projects/${projectId}/board`);
    render(<PortalProjectTabs projectId={projectId} />);

    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Canvas" })).toHaveAttribute("data-active", "false");
  });

  it("marks the canvas tab active on the canvas path", () => {
    mockedUsePathname.mockReturnValue(`/portal/projects/${projectId}/canvas`);
    render(<PortalProjectTabs projectId={projectId} />);

    expect(screen.getByRole("link", { name: "Canvas" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("data-active", "false");
  });
});
