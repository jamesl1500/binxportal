import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/imports/actions", () => ({
  parseImportFileAction: vi.fn(),
  runImportAction: vi.fn(),
}));

import { parseImportFileAction, runImportAction } from "@/app/(app)/imports/actions";
import BulkImportWizard from "./BulkImportWizard";

const parse = vi.mocked(parseImportFileAction);
const run = vi.mocked(runImportAction);

const parsed = {
  columns: ["Company", "Email"],
  rows: [
    { row: 2, cells: ["Acme", "a@acme.com"] },
    { row: 3, cells: ["Existing", ""] },
    { row: 4, cells: ["Gamma", ""] },
  ],
  fields: [
    { key: "name", label: "Client name", required: true },
    { key: "primary_contact_email", label: "Contact email", required: false },
  ],
  mapping: { name: 0, primary_contact_email: 1 },
};

const result = (dryRun: boolean) => ({
  dry_run: dryRun,
  rows: [
    { row: 2, label: "Acme", status: "ok" as const, message: null },
    {
      row: 3,
      label: "Existing",
      status: "duplicate" as const,
      message: "You already have a client named “Existing”",
    },
    {
      row: 4,
      label: "Gamma",
      status: "over_limit" as const,
      message: "Over your Free plan's limit",
    },
  ],
  imported: 1,
  duplicates: 1,
  invalid: 0,
  over_limit: 1,
  plan_name: "Free",
  limit: 3,
  remaining: 1,
});

const upload = async () => {
  const file = new File(["Company,Email\n"], "clients.csv", {
    type: "text/csv",
  });
  await userEvent.upload(screen.getByLabelText("Upload a clients spreadsheet"), file);
  return file;
};

beforeEach(() => {
  vi.clearAllMocks();
  parse.mockResolvedValue({ parsed } as never);
  run.mockImplementation(async (_agency, _kind, _rows, dryRun) => ({ result: result(dryRun) }) as never);
});

describe("BulkImportWizard", () => {
  it("uploads, maps, reviews, and imports", async () => {
    const onImported = vi.fn();
    render(
      <BulkImportWizard
        agencyId="a1"
        kind="clients"
        nextHref="/clients"
        nextLabel="View clients"
        onImported={onImported}
      />,
    );

    const file = await upload();
    expect(parse).toHaveBeenCalledWith("a1", "clients", expect.any(FormData));
    expect((parse.mock.calls[0][2] as FormData).get("file")).toBe(file);

    // Map step: pre-filled from the API's suggestion, with a sample value.
    expect(await screen.findByRole("heading", { name: "Match your columns" })).toBeInTheDocument();
    expect((screen.getByLabelText(/Client name/) as HTMLSelectElement).value).toBe("0");
    expect(screen.getByText("e.g. Acme")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Review rows" }));
    expect(run).toHaveBeenCalledWith(
      "a1",
      "clients",
      [
        { row: 2, name: "Acme", primary_contact_email: "a@acme.com" },
        { row: 3, name: "Existing", primary_contact_email: "" },
        { row: 4, name: "Gamma", primary_contact_email: "" },
      ],
      true,
    );

    // Review: nothing written yet, the limit is explained.
    expect(await screen.findByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(
      screen.getByText(/Your Free plan allows 3 clients and has room for 1 more, so 1 row will be skipped/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade your plan" })).toHaveAttribute("href", "/settings/plan");
    await userEvent.click(screen.getByRole("button", { name: "Skipped (2)" }));
    expect(within(screen.getByRole("table")).queryByText("Acme")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Import 1 client" }));
    expect(run).toHaveBeenLastCalledWith("a1", "clients", expect.any(Array), false);
    expect(await screen.findByRole("heading", { name: "Imported 1 client" })).toBeInTheDocument();
    expect(screen.getByText("2 rows were skipped — see why below.")).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ imported: 1 }));
    expect(screen.getByRole("link", { name: "View clients" })).toHaveAttribute("href", "/clients");
  });

  it("requires the required fields to be mapped", async () => {
    render(<BulkImportWizard agencyId="a1" kind="clients" />);
    await upload();
    await userEvent.selectOptions(await screen.findByLabelText(/Client name/), "");
    expect(screen.getByText("Choose a column for Client name.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review rows" })).toBeDisabled();
  });

  it("shows a parse error and stays on the upload step", async () => {
    parse.mockResolvedValueOnce({ error: "Upload a .csv or .xlsx file" });
    render(<BulkImportWizard agencyId="a1" kind="clients" />);
    await upload();
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload a .csv or .xlsx file");
    expect(screen.getByLabelText("Upload a clients spreadsheet")).toBeInTheDocument();
  });

  it("can't import when no row is ready", async () => {
    run.mockResolvedValue({
      result: {
        ...result(true),
        imported: 0,
        rows: result(true).rows.slice(1),
      },
    } as never);
    render(<BulkImportWizard agencyId="a1" kind="team" />);
    await userEvent.upload(screen.getByLabelText("Upload a team spreadsheet"), new File(["x"], "t.csv"));
    await userEvent.click(await screen.findByRole("button", { name: "Review rows" }));
    expect(await screen.findByRole("button", { name: "Nothing to import" })).toBeDisabled();
  });

  it("offers templates", () => {
    render(<BulkImportWizard agencyId="a1" kind="team" />);
    expect(screen.getByRole("link", { name: "Excel" })).toHaveAttribute("href", "/templates/team-import-template.xlsx");
  });
});
