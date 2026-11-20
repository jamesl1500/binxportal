/**
 * kinds.ts - Import & export catalog
 *
 * What the Import & export page lists, in order: a label and one line of
 * explanation per kind, and whether it can be imported. Exports always
 * work; invoices and proposals are export-only (importing them would skip
 * invoice numbering, payments and Stripe).
 *
 * @module apps/binx-web/src/app/(app)/data/kinds.ts
 */
import type { ExportKind, ImportKind } from "@/lib/imports-client";

export interface DataKindInfo {
  kind: ExportKind;
  label: string;
  description: string;
  /** Set when the kind can be imported; the import page's heading and intro. */
  importable?: { heading: string; intro: string; adminOnly?: boolean };
}

export const DATA_KINDS: DataKindInfo[] = [
  {
    kind: "clients",
    label: "Clients",
    description: "Every client with its contact and billing details, including archived ones.",
    importable: {
      heading: "Import clients",
      intro: "Only the client name is required. Clients you already have are skipped.",
    },
  },
  {
    kind: "team",
    label: "Team",
    description: "Everyone on the team with their role. Owners and admins also get pending invitations and notes.",
    importable: {
      heading: "Invite your team",
      intro: "One email per row, with an optional role (admin or member). Everyone gets an invitation email.",
      adminOnly: true,
    },
  },
  {
    kind: "leads",
    label: "Leads",
    description: "Your pipeline: contacts, estimated value, status, owner and score.",
    importable: {
      heading: "Import leads",
      intro: "Only the lead name is required. Leads with a name or contact email you already have are skipped.",
    },
  },
  {
    kind: "projects",
    label: "Projects",
    description: "Every project with its client, status, dates and hourly rate.",
    importable: {
      heading: "Import projects",
      intro:
        "Each project needs a name and the name of an existing client — import clients first. Every project gets the usual board columns.",
    },
  },
  {
    kind: "tasks",
    label: "Tasks",
    description: "Every task on every board, with its column, due date and assignee.",
    importable: {
      heading: "Import tasks",
      intro:
        "Each task needs a title and an existing project. Columns the board doesn't have yet are added, and assignees are matched by email.",
    },
  },
  {
    kind: "time_entries",
    label: "Time entries",
    description: "Logged time with project, task, person, billable status and rate.",
    importable: {
      heading: "Import time entries",
      intro:
        "Each entry needs a date, hours (1.5 or 1:30) and an existing project. Leave the team member blank for your own time — only owners and admins can import other people's.",
    },
  },
  {
    kind: "invoices",
    label: "Invoices",
    description: "Every invoice with its status, dates and totals.",
  },
  {
    kind: "proposals",
    label: "Proposals",
    description: "Every proposal with its recipient, status and total.",
  },
];

export function importableKind(kind: string): (DataKindInfo & { kind: ImportKind }) | undefined {
  const info = DATA_KINDS.find((entry) => entry.kind === kind && entry.importable);
  return info as (DataKindInfo & { kind: ImportKind }) | undefined;
}
