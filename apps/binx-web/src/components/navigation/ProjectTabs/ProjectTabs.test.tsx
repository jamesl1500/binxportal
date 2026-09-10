import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from "next/navigation";

import ProjectTabs from "./ProjectTabs";

const mockedUsePathname = vi.mocked(usePathname);

const projectId = "11111111-1111-1111-1111-111111111111";

describe("ProjectTabs", () => {
  it("links to the dashboard, board, and settings pages", () => {
    mockedUsePathname.mockReturnValue(`/projects/${projectId}`);
    render(<ProjectTabs projectId={projectId} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", `/projects/${projectId}`);
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("href", `/projects/${projectId}/board`);
    expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("href", `/projects/${projectId}/files`);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", `/projects/${projectId}/settings`);
  });

  it("does not render a Messages tab", () => {
    mockedUsePathname.mockReturnValue(`/projects/${projectId}`);
    render(<ProjectTabs projectId={projectId} />);
    expect(screen.queryByRole("link", { name: /messages/i })).not.toBeInTheDocument();
  });

  it("marks the dashboard tab active on the base project path", () => {
    mockedUsePathname.mockReturnValue(`/projects/${projectId}`);
    render(<ProjectTabs projectId={projectId} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("data-active", "false");
  });

  it("marks the board tab active on the board path", () => {
    mockedUsePathname.mockReturnValue(`/projects/${projectId}/board`);
    render(<ProjectTabs projectId={projectId} />);

    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("data-active", "false");
  });

  it("marks the settings tab active on the settings path", () => {
    mockedUsePathname.mockReturnValue(`/projects/${projectId}/settings`);
    render(<ProjectTabs projectId={projectId} />);

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("data-active", "false");
  });

  it("marks the files tab active on the files path", () => {
    mockedUsePathname.mockReturnValue(`/projects/${projectId}/files`);
    render(<ProjectTabs projectId={projectId} />);

    expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Board" })).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("data-active", "false");
  });

});
