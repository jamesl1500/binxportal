import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(portal-auth)/portal/resend-invitation/actions", () => ({
  searchPortalAgenciesAction: vi.fn(),
}));

import { searchPortalAgenciesAction } from "@/app/(portal-auth)/portal/resend-invitation/actions";
import type { PortalAgencyMatch } from "@/lib/portal";

import AgencyNameField from "./AgencyNameField";

const mockedSearch = vi.mocked(searchPortalAgenciesAction);

const PIXEL: PortalAgencyMatch = { id: "a1", name: "Pixel Forge" };
const PIXELS: PortalAgencyMatch = { id: "a2", name: "Pixels & Co" };

const onSelect = vi.fn();

/** The field inside a real react-hook-form, the way the resend form uses it. */
const Harness = () => {
  const { register, setValue } = useForm<{ agency_name: string }>();
  return (
    <AgencyNameField
      id="agencyName"
      registration={register("agency_name")}
      onSelect={(agency) => {
        onSelect(agency);
        if (agency) setValue("agency_name", agency.name);
      }}
    />
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedSearch.mockResolvedValue([PIXEL, PIXELS]);
});

describe("AgencyNameField", () => {
  it("suggests matching agencies as the client types and fills in the one they pick", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");

    await user.type(input, "pix");

    expect(await screen.findByRole("option", { name: "Pixel Forge" })).toBeInTheDocument();
    expect(mockedSearch).toHaveBeenLastCalledWith("pix");
    expect(input).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("option", { name: "Pixels & Co" }));

    expect(input).toHaveValue("Pixels & Co");
    expect(onSelect).toHaveBeenLastCalledWith(PIXELS);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("can be driven from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");

    await user.type(input, "pix");
    await screen.findByRole("option", { name: "Pixel Forge" });
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}{Enter}");

    expect(input).toHaveValue("Pixel Forge");
    expect(onSelect).toHaveBeenLastCalledWith(PIXEL);
  });

  it("doesn't search until there are two characters", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox"), "p");
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("says so when nothing matches, and forgets the pick once the name is edited", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");

    await user.type(input, "pix");
    await user.click(await screen.findByRole("option", { name: "Pixel Forge" }));
    expect(onSelect).toHaveBeenLastCalledWith(PIXEL);

    mockedSearch.mockResolvedValue([]);
    await user.type(input, "zz");

    expect(onSelect).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(screen.getByText(/No agency found by that name/)).toBeInTheDocument());
  });
});
