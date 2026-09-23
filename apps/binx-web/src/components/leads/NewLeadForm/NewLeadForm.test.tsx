import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@/components/leads/LeadForm/LeadForm", () => ({
  default: ({ onSuccess }: { onSuccess: (l: unknown) => void }) => (
    <button onClick={() => onSuccess({ id: "l1" })}>fake-save</button>
  ),
}));

import NewLeadForm from "./NewLeadForm";

beforeEach(() => vi.clearAllMocks());

describe("NewLeadForm", () => {
  it("navigates to the new lead's page once saved", async () => {
    render(<NewLeadForm agencyId="a1" />);
    await userEvent.click(screen.getByRole("button", { name: "fake-save" }));
    expect(mockPush).toHaveBeenCalledWith("/leads/l1");
  });
});
