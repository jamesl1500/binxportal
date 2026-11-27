import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Service } from "@/lib/services-client";

import ServicePicker from "./ServicePicker";

const svc = (overrides: Partial<Service>): Service => ({
  id: "s",
  agency_id: "a1",
  name: "Service",
  description: null,
  pricing_type: "fixed",
  unit_price_cents: 100_000,
  default_quantity: "1.00",
  is_archived: false,
  is_starting_price: false,
  created_at: "2026-11-01T00:00:00Z",
  ...overrides,
});

describe("ServicePicker", () => {
  it("lists services flat when none are categorised", () => {
    render(<ServicePicker services={[svc({ id: "a", name: "Logo" })]} currency="USD" onPick={() => {}} />);
    expect(screen.getByRole("option", { name: "Logo · $1,000.00" })).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("groups by category, uncategorised last, with starting prices as From", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    const services = [
      svc({ id: "a", name: "Odd job" }),
      svc({ id: "b", name: "Retainer", pricing_type: "monthly", category_name: "Retainers", category_id: "c2" }),
      svc({ id: "c", name: "Identity", is_starting_price: true, category_name: "Branding", category_id: "c1" }),
    ];
    render(<ServicePicker services={services} currency="USD" onPick={onPick} />);

    const groups = screen.getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("label"))).toEqual(["Branding", "Retainers", "Other"]);
    expect(within(groups[0]).getByRole("option", { name: "Identity · From $1,000.00" })).toBeInTheDocument();
    expect(within(groups[1]).getByRole("option", { name: "Retainer · $1,000.00 / mo" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Add from services"), "c");
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }));
  });
});
