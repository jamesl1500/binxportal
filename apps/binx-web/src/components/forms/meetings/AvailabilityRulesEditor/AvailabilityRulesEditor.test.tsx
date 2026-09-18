import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/settings/meetings/actions", () => ({ putAvailabilityRulesAction: vi.fn() }));

import { putAvailabilityRulesAction } from "@/app/(app)/settings/meetings/actions";
import AvailabilityRulesEditor from "./AvailabilityRulesEditor";

const mocked = vi.mocked(putAvailabilityRulesAction);

const initialRules = [
  { id: "r1", weekday: 0, start_time: "09:00:00", end_time: "12:00:00" },
  { id: "r2", weekday: 0, start_time: "13:00:00", end_time: "17:00:00" },
  { id: "r3", weekday: 6, start_time: "10:00:00", end_time: "14:00:00" },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue({} as never);
});

describe("AvailabilityRulesEditor", () => {
  it("shows a read-only note for a non-manager", () => {
    render(<AvailabilityRulesEditor agencyId="a1" initialRules={initialRules} canManage={false} />);
    expect(screen.getByText(/only an owner or admin/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save availability/i })).toBeNull();
  });

  it("prefills existing blocks under the correct weekday, Monday=0 through Sunday=6", () => {
    render(<AvailabilityRulesEditor agencyId="a1" initialRules={initialRules} canManage />);

    // Monday has two blocks (split shift), Sunday has one, every other day none.
    const mondayStarts = screen.getAllByLabelText("Monday block start time");
    expect(mondayStarts).toHaveLength(2);
    expect(mondayStarts[0]).toHaveValue("09:00");
    const sundayStarts = screen.getAllByLabelText("Sunday block start time");
    expect(sundayStarts).toHaveLength(1);
    expect(sundayStarts[0]).toHaveValue("10:00");
    expect(screen.getAllByText("Not available")).toHaveLength(5);
  });

  it("adds a block to a day and saves the full replaced rule list", async () => {
    render(<AvailabilityRulesEditor agencyId="a1" initialRules={[]} canManage />);

    const [mondayAdd] = screen.getAllByRole("button", { name: /add time block/i });
    await userEvent.click(mondayAdd);

    expect(screen.getByLabelText("Monday block start time")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save availability" }));

    expect(mocked).toHaveBeenCalledWith("a1", [{ weekday: 0, start_time: "09:00", end_time: "17:00" }]);
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("removes a block", async () => {
    render(<AvailabilityRulesEditor agencyId="a1" initialRules={initialRules} canManage />);

    expect(screen.getAllByLabelText("Monday block start time")).toHaveLength(2);
    await userEvent.click(screen.getAllByRole("button", { name: "Remove Monday block" })[0]);
    expect(screen.getAllByLabelText("Monday block start time")).toHaveLength(1);
  });

  it("rejects an end time that isn't after the start time", async () => {
    render(<AvailabilityRulesEditor agencyId="a1" initialRules={initialRules} canManage />);

    const mondayEnd = screen.getAllByLabelText("Monday block end time")[0];
    await userEvent.clear(mondayEnd);
    await userEvent.type(mondayEnd, "08:00");
    await userEvent.click(screen.getByRole("button", { name: "Save availability" }));

    expect(await screen.findByText(/end time must be after/i)).toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("surfaces a server error", async () => {
    mocked.mockResolvedValueOnce({ error: "Not permitted" } as never);
    render(<AvailabilityRulesEditor agencyId="a1" initialRules={initialRules} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect(await screen.findByText("Not permitted")).toBeInTheDocument();
  });
});
