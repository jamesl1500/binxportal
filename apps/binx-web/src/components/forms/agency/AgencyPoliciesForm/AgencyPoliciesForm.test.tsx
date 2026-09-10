import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/settings/actions", () => ({ updateAgencyProfileAction: vi.fn() }));

import { updateAgencyProfileAction } from "@/app/(app)/settings/actions";
import type { AgencyProfile } from "@/lib/agencies";

import AgencyPoliciesForm from "./AgencyPoliciesForm";

const mockedUpdate = vi.mocked(updateAgencyProfileAction);

const profile = {
  terms_of_service: "Existing terms",
  privacy_policy: null,
  working_policy: null,
  cancellation_policy: null,
} as AgencyProfile;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgencyPoliciesForm", () => {
  it("prefills existing policies and submits the full set (nulling blanks)", async () => {
    mockedUpdate.mockResolvedValueOnce({ profile });
    const user = userEvent.setup();
    render(<AgencyPoliciesForm agencyId="a1" profile={profile} />);

    expect(screen.getByLabelText("Terms of service")).toHaveValue("Existing terms");

    await user.type(screen.getByLabelText("Working / client policy"), "Be responsive");
    await user.click(screen.getByRole("button", { name: /save policies/i }));

    expect(await screen.findByText("Policies saved.")).toBeInTheDocument();
    expect(mockedUpdate).toHaveBeenCalledWith("a1", {
      terms_of_service: "Existing terms",
      privacy_policy: null,
      working_policy: "Be responsive",
      cancellation_policy: null,
    });
  });
});
