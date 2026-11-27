import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/settings/services/actions", () => ({
  createServiceAction: vi.fn(),
  updateServiceAction: vi.fn(),
  setServiceArchivedAction: vi.fn(),
  deleteServiceAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";

import {
  createServiceAction,
  deleteServiceAction,
  setServiceArchivedAction,
  updateServiceAction,
} from "@/app/(app)/settings/services/actions";
import type { Service } from "@/lib/services-client";

import ServicesManager from "./ServicesManager";

const mockedCreate = vi.mocked(createServiceAction);
const mockedUpdate = vi.mocked(updateServiceAction);
const mockedArchive = vi.mocked(setServiceArchivedAction);
const mockedDelete = vi.mocked(deleteServiceAction);

function service(overrides: Partial<Service> = {}): Service {
  return {
    id: "svc-1",
    agency_id: "a1",
    name: "Design retainer",
    description: "Ongoing design support",
    pricing_type: "monthly",
    unit_price_cents: 200000,
    default_quantity: "1.00",
    is_archived: false,
    created_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServicesManager", () => {
  it("lists active services with their price and pricing type", () => {
    render(<ServicesManager agencyId="a1" services={[service()]} currency="USD" canManage />);

    expect(screen.getByText("Design retainer")).toBeInTheDocument();
    expect(screen.getByText("Ongoing design support")).toBeInTheDocument();
    expect(screen.getByText("$2,000.00 / mo")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
  });

  it("is read-only for members", () => {
    render(<ServicesManager agencyId="a1" services={[service()]} currency="USD" canManage={false} />);

    expect(screen.queryByRole("button", { name: /add service/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit design retainer/i })).not.toBeInTheDocument();
  });

  it("explains the empty catalog", () => {
    render(<ServicesManager agencyId="a1" services={[]} currency="USD" canManage />);
    expect(screen.getByText(/no services yet/i)).toBeInTheDocument();
  });

  it("adds a service with the price converted to cents", async () => {
    mockedCreate.mockResolvedValueOnce({ service: service() });
    const user = userEvent.setup();
    render(<ServicesManager agencyId="a1" services={[]} currency="USD" canManage />);

    await user.click(screen.getByRole("button", { name: /add service/i }));
    const submit = screen.getByRole("button", { name: "Add service" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "  Brand strategy ");
    await user.selectOptions(screen.getByLabelText("Pricing"), "hourly");
    await user.type(screen.getByLabelText("Price (USD)"), "150.5");
    await user.type(screen.getByLabelText("Description"), "Per hour of strategy");
    await user.click(submit);

    expect(mockedCreate).toHaveBeenCalledWith("a1", {
      name: "Brand strategy",
      description: "Per hour of strategy",
      pricingType: "hourly",
      unitPriceCents: 15050,
      defaultQuantity: "1",
    });
    expect(toast.success).toHaveBeenCalled();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("keeps the form open and shows the error when the add fails", async () => {
    mockedCreate.mockResolvedValueOnce({ error: "A service called “Retainer” already exists" });
    const user = userEvent.setup();
    render(<ServicesManager agencyId="a1" services={[]} currency="USD" canManage />);

    await user.click(screen.getByRole("button", { name: /add service/i }));
    await user.type(screen.getByLabelText("Name"), "Retainer");
    await user.type(screen.getByLabelText("Price (USD)"), "100");
    await user.click(screen.getByRole("button", { name: "Add service" }));

    expect(toast.error).toHaveBeenCalledWith("A service called “Retainer” already exists");
    expect(screen.getByLabelText("Name")).toHaveValue("Retainer");
  });

  it("edits a service in place", async () => {
    mockedUpdate.mockResolvedValueOnce({ service: service() });
    const user = userEvent.setup();
    render(<ServicesManager agencyId="a1" services={[service()]} currency="USD" canManage />);

    await user.click(screen.getByRole("button", { name: /edit design retainer/i }));
    const price = screen.getByLabelText("Price (USD)");
    expect(price).toHaveValue(2000);
    await user.clear(price);
    await user.type(price, "2500");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockedUpdate).toHaveBeenCalledWith(
      "a1",
      "svc-1",
      expect.objectContaining({ name: "Design retainer", unitPriceCents: 250000, pricingType: "monthly" }),
    );
  });

  it("archives, and shows archived services behind a toggle with a restore action", async () => {
    mockedArchive.mockResolvedValue({ service: service() });
    const user = userEvent.setup();
    render(
      <ServicesManager
        agencyId="a1"
        services={[service(), service({ id: "svc-old", name: "Old package", is_archived: true })]}
        currency="USD"
        canManage
      />,
    );

    expect(screen.queryByText("Old package")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /archive design retainer/i }));
    expect(mockedArchive).toHaveBeenCalledWith("a1", "svc-1", true);

    await user.click(screen.getByRole("button", { name: "Show 1 archived service" }));
    const archivedRow = screen.getByText("Old package").closest("li")!;
    expect(within(archivedRow).getByText("Archived")).toBeInTheDocument();
    await user.click(within(archivedRow).getByRole("button", { name: /restore old package/i }));
    expect(mockedArchive).toHaveBeenCalledWith("a1", "svc-old", false);
  });

  it("asks before deleting", async () => {
    mockedDelete.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ServicesManager agencyId="a1" services={[service()]} currency="USD" canManage />);

    await user.click(screen.getByRole("button", { name: /delete design retainer/i }));
    expect(mockedDelete).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Delete service" }));
    expect(mockedDelete).toHaveBeenCalledWith("a1", "svc-1");
  });
});
