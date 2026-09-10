import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/app/(app)/leads/actions", () => ({ convertLeadAction: vi.fn() }));

import { convertLeadAction } from "@/app/(app)/leads/actions";
import ConvertLeadButton from "./ConvertLeadButton";

const mockedConvert = vi.mocked(convertLeadAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConvertLeadButton", () => {
  it("shows a link to the client once converted", () => {
    render(
      <ConvertLeadButton
        agencyId="a1"
        leadId="l1"
        leadName="Acme"
        convertedClientId="c9"
        convertedClientName="Acme Co"
      />,
    );
    expect(screen.getByRole("link", { name: "Acme Co" })).toHaveAttribute("href", "/clients/c9");
    expect(screen.queryByRole("button", { name: /Convert/ })).not.toBeInTheDocument();
  });

  it("confirms then calls the action", async () => {
    mockedConvert.mockResolvedValueOnce({} as never);
    const user = userEvent.setup();
    render(
      <ConvertLeadButton
        agencyId="a1"
        leadId="l1"
        leadName="Acme"
        convertedClientId={null}
        convertedClientName={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Convert to client" }));
    expect(mockedConvert).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, convert" }));
    expect(mockedConvert).toHaveBeenCalledWith("a1", "l1");
  });
});
