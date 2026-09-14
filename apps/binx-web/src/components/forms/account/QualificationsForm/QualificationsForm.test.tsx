import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/profile/actions", () => ({
  updateQualificationsAction: vi.fn(),
}));

import { updateQualificationsAction } from "@/app/(app)/profile/actions";
import type { UserProfileData } from "@/lib/users";
import QualificationsForm from "./QualificationsForm";

const mocked = vi.mocked(updateQualificationsAction);

const profile: UserProfileData = {
  has_avatar: false,
  avatar_version: null,
  has_cover: false,
  cover_version: null,
  skills: ["Python"],
  experience: [],
  education: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue({} as never);
});

describe("QualificationsForm", () => {
  it("renders the three sections seeded from the initial profile", () => {
    render(<QualificationsForm profile={profile} />);
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Experience" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Education" })).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
  });

  it("saves the current skills/experience/education on submit", async () => {
    const user = userEvent.setup();
    render(<QualificationsForm profile={profile} />);

    await user.type(screen.getByLabelText("Add a skill"), "Figma{Enter}");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocked).toHaveBeenCalledWith({ skills: ["Python", "Figma"], experience: [], education: [] });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a server error and does not claim success", async () => {
    const user = userEvent.setup();
    mocked.mockResolvedValueOnce({ error: "Too many skills" } as never);
    render(<QualificationsForm profile={profile} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Too many skills")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });
});
