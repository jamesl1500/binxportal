import { describe, expect, it } from "vitest";

import { EXPORT_KINDS, IMPORT_KINDS } from "@/lib/imports-client";

import { DATA_KINDS, importableKind } from "./kinds";

describe("data kinds", () => {
  it("lists every export kind exactly once", () => {
    expect(DATA_KINDS.map((info) => info.kind).sort()).toEqual([...EXPORT_KINDS].sort());
  });

  it("marks exactly the import kinds as importable", () => {
    const importable = DATA_KINDS.filter((info) => info.importable).map((info) => info.kind);
    expect(importable.sort()).toEqual([...IMPORT_KINDS].sort());
  });

  it("keeps the services import to owners and admins", () => {
    expect(importableKind("services")?.importable?.adminOnly).toBe(true);
    expect(importableKind("invoices")).toBeUndefined();
  });
});
