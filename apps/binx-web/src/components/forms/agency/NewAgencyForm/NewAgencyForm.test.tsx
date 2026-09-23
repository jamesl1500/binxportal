import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/actions", () => ({
  createAgencyAction: vi.fn(),
}));

const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

import { createAgencyAction } from "@/app/(app)/actions";

import NewAgencyForm from "./NewAgencyForm";

const mockedCreate = vi.mocked(createAgencyAction);

beforeEach(() => vi.clearAllMocks());

describe("NewAgencyForm", () => {
  it("creates an agency and navigates to the dashboard", async () => {
    mockedCreate.mockResolvedValueOnce({
      agency: { id: "cccccccc-3333-3333-3333-333333333333", name: "New Co", slug: "new-co", role: "owner", has_logo: false },
    });
    const user = userEvent.setup();
    render(<NewAgencyForm />);

    await user.type(screen.getByLabelText("Agency name"), "New Co");
    await user.click(screen.getByRole("button", { name: /^create agency$/i }));

    expect(mockedCreate).toHaveBeenCalledWith("New Co");
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("goes back on cancel without creating anything", async () => {
    const user = userEvent.setup();
    render(<NewAgencyForm />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockBack).toHaveBeenCalledOnce();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
