import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/settings/actions", () => ({ updateAgencyProfileAction: vi.fn() }));

import { updateAgencyProfileAction } from "@/app/(app)/settings/actions";
import type { AgencyProfile } from "@/lib/agencies";

import AgencyProfileForm from "./AgencyProfileForm";

const mockedUpdate = vi.mocked(updateAgencyProfileAction);

const emptyProfile = {
  agency_id: "a1",
  tagline: null,
  brand_color: null,
  about: null,
  founded_year: null,
  headquarters: null,
  contact_email: null,
  contact_phone: null,
  website: null,
  address: null,
  linkedin_url: null,
  twitter_url: null,
  instagram_url: null,
  facebook_url: null,
  terms_of_service: null,
  privacy_policy: null,
  working_policy: null,
  cancellation_policy: null,
  has_logo: false,
  has_cover: false,
  logo_version: null,
  cover_version: null,
} satisfies AgencyProfile;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgencyProfileForm", () => {
  it("blocks submission for an invalid founded year", async () => {
    const user = userEvent.setup();
    render(<AgencyProfileForm agencyId="a1" profile={emptyProfile} />);

    await user.type(screen.getByLabelText("Founded"), "99");
    await user.click(screen.getByRole("button", { name: /save details/i }));

    expect(await screen.findByText("Enter a 4-digit year")).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("submits the mapped payload and reports success", async () => {
    mockedUpdate.mockResolvedValueOnce({ profile: emptyProfile });
    const user = userEvent.setup();
    render(<AgencyProfileForm agencyId="a1" profile={emptyProfile} />);

    await user.type(screen.getByLabelText("About"), "  We build software  ");
    await user.type(screen.getByLabelText("Founded"), "2019");
    await user.type(screen.getByLabelText("Contact email"), "hi@acme.test");
    await user.click(screen.getByRole("button", { name: /save details/i }));

    expect(await screen.findByText("Agency details saved.")).toBeInTheDocument();
    expect(mockedUpdate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ about: "We build software", founded_year: 2019, contact_email: "hi@acme.test" }),
    );
  });
});
