import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/projects/[projectId]/time/actions", () => ({
  createInvoiceFromTimeEntriesAction: vi.fn(),
  deleteTimeEntryAction: vi.fn(),
  updateTimeEntryAction: vi.fn(),
}));

const mockedToastError = vi.fn();
const mockedToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockedToastError(...args), success: (...args: unknown[]) => mockedToastSuccess(...args) },
}));

import {
  createInvoiceFromTimeEntriesAction,
  deleteTimeEntryAction,
  updateTimeEntryAction,
} from "@/app/(app)/projects/[projectId]/time/actions";
import type { TimeEntry } from "@/lib/time-tracking";

import TimeEntriesTable from "./TimeEntriesTable";

const mockedCreateInvoice = vi.mocked(createInvoiceFromTimeEntriesAction);
const mockedDelete = vi.mocked(deleteTimeEntryAction);
const mockedUpdate = vi.mocked(updateTimeEntryAction);

const agencyId = "agency-1";
const projectId = "project-1";
const clientId = "client-1";
const tasks = [{ id: "task-1", title: "Design the hero" }];

function makeEntry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: "entry-base",
    project_id: projectId,
    project_name: "Acme Rebrand",
    task_id: null,
    task_title: null,
    user_id: "user-1",
    user_name: "Jane Doe",
    description: "Client call",
    started_at: "2026-01-15T09:00:00.000Z",
    ended_at: "2026-01-15T10:30:00.000Z",
    duration_minutes: 90,
    is_billable: true,
    hourly_rate_cents: 10000,
    amount_cents: 15000,
    invoiced: false,
    created_at: "2026-01-15T09:00:00.000Z",
    ...overrides,
  } as TimeEntry;
}

const billableEntry = makeEntry({ id: "entry-billable", task_id: "task-1", task_title: "Design the hero" });
const runningEntry = makeEntry({
  id: "entry-running",
  ended_at: null,
  duration_minutes: 0,
  hourly_rate_cents: null,
  amount_cents: null,
});
const invoicedEntry = makeEntry({ id: "entry-invoiced", invoiced: true });
const nonBillableEntry = makeEntry({ id: "entry-nonbillable", is_billable: false, amount_cents: null });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TimeEntriesTable", () => {
  it("shows the empty state when there are no entries", () => {
    render(<TimeEntriesTable agencyId={agencyId} projectId={projectId} clientId={clientId} entries={[]} tasks={tasks} />);
    expect(screen.getByText("No time logged yet")).toBeInTheDocument();
  });

  it("renders a row for each entry with its details", () => {
    render(
      <TimeEntriesTable agencyId={agencyId} projectId={projectId} clientId={clientId} entries={[billableEntry]} tasks={tasks} />,
    );

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Design the hero")).toBeInTheDocument();
    expect(screen.getByText("Client call")).toBeInTheDocument();
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
    expect(screen.getByText("$100.00/hr")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
  });

  it("shows a running badge for an entry with no ended_at", () => {
    render(
      <TimeEntriesTable agencyId={agencyId} projectId={projectId} clientId={clientId} entries={[runningEntry]} tasks={tasks} />,
    );
    expect(screen.getByText("Running…")).toBeInTheDocument();
  });

  it("shows an Invoiced badge for an invoiced entry", () => {
    render(
      <TimeEntriesTable agencyId={agencyId} projectId={projectId} clientId={clientId} entries={[invoicedEntry]} tasks={tasks} />,
    );
    expect(screen.getByText("Invoiced", { selector: "span" })).toBeInTheDocument();
  });

  it("only allows selecting uninvoiced, billable, stopped, rated entries", () => {
    render(
      <TimeEntriesTable
        agencyId={agencyId}
        projectId={projectId}
        clientId={clientId}
        entries={[billableEntry, runningEntry, invoicedEntry, nonBillableEntry]}
        tasks={tasks}
      />,
    );

    const rows = screen.getAllByRole("row").slice(1); // skip header row
    // running, invoiced, and non-billable rows' checkboxes should be disabled
    const checkboxesByRow = rows.map((row) => within(row).getByRole("checkbox") as HTMLInputElement);
    expect(checkboxesByRow[0]).not.toBeDisabled(); // billableEntry
    expect(checkboxesByRow[1]).toBeDisabled(); // runningEntry
    expect(checkboxesByRow[2]).toBeDisabled(); // invoicedEntry
    expect(checkboxesByRow[3]).toBeDisabled(); // nonBillableEntry
  });

  it("generates an invoice from the selected entries and reports an error without redirecting", async () => {
    mockedCreateInvoice.mockResolvedValueOnce({ error: "One or more entries have no hourly rate" });
    const user = userEvent.setup();
    render(
      <TimeEntriesTable agencyId={agencyId} projectId={projectId} clientId={clientId} entries={[billableEntry]} tasks={tasks} />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select entry from Jan 15, 2026" }));
    await user.click(screen.getByRole("button", { name: "Generate invoice from selected" }));

    expect(mockedCreateInvoice).toHaveBeenCalledWith(agencyId, clientId, projectId, ["entry-billable"]);
    expect(await screen.findByText("One or more entries have no hourly rate")).toBeInTheDocument();
    expect(mockedToastError).toHaveBeenCalledWith("One or more entries have no hourly rate");
  });

  it("disables the generate button until an entry is selected", () => {
    render(
      <TimeEntriesTable agencyId={agencyId} projectId={projectId} clientId={clientId} entries={[billableEntry]} tasks={tasks} />,
    );
    expect(screen.getByRole("button", { name: "Generate invoice from selected" })).toBeDisabled();
  });

  it("disables edit for invoiced and running entries, and delete for invoiced entries", () => {
    render(
      <TimeEntriesTable
        agencyId={agencyId}
        projectId={projectId}
        clientId={clientId}
        entries={[billableEntry, runningEntry, invoicedEntry]}
        tasks={tasks}
      />,
    );

    const editButtons = screen.getAllByRole("button", { name: /Edit entry/ });
    expect(editButtons[0]).not.toBeDisabled(); // billable
    expect(editButtons[1]).toBeDisabled(); // running
    expect(editButtons[2]).toBeDisabled(); // invoiced

    const deleteButtons = screen.getAllByRole("button", { name: /Delete entry/ });
    expect(deleteButtons[0]).not.toBeDisabled();
    expect(deleteButtons[1]).not.toBeDisabled(); // running entries can still be deleted
    expect(deleteButtons[2]).toBeDisabled(); // invoiced
  });

  it("edits an entry through the dialog", async () => {
    mockedUpdate.mockResolvedValueOnce({ entry: billableEntry });
    const user = userEvent.setup();
    render(
      <TimeEntriesTable agencyId={agencyId} projectId={projectId} clientId={clientId} entries={[billableEntry]} tasks={tasks} />,
    );

    await user.click(screen.getByRole("button", { name: "Edit entry from Jan 15, 2026" }));
    expect(await screen.findByText("Edit time entry")).toBeInTheDocument();

    const description = screen.getByLabelText("Description") as HTMLInputElement;
    expect(description.value).toBe("Client call");
    await user.clear(description);
    await user.type(description, "Updated call");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockedUpdate).toHaveBeenCalledWith(
      agencyId,
      projectId,
      "entry-billable",
      expect.objectContaining({ description: "Updated call", taskId: "task-1", isBillable: true, hourlyRateCents: 10000 }),
    );
    expect(mockedToastSuccess).toHaveBeenCalledWith("Time entry updated");
  });

  it("deletes an entry through the confirm dialog", async () => {
    mockedDelete.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(
      <TimeEntriesTable agencyId={agencyId} projectId={projectId} clientId={clientId} entries={[billableEntry]} tasks={tasks} />,
    );

    await user.click(screen.getByRole("button", { name: "Delete entry from Jan 15, 2026" }));
    expect(await screen.findByText("Delete this time entry?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete entry" }));

    expect(mockedDelete).toHaveBeenCalledWith(agencyId, projectId, "entry-billable");
    expect(mockedToastSuccess).toHaveBeenCalledWith("Time entry deleted");
  });
});
