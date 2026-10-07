import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ refresh: vi.fn() }));

vi.mock("@/lib/imports", () => ({
  parseImportFile: vi.fn(),
  runImport: vi.fn(),
}));

import { refresh } from "next/cache";

import { runImport } from "@/lib/imports";
import { runImportAction } from "./actions";

const mockedRefresh = vi.mocked(refresh);
const mockedRunImport = vi.mocked(runImport);

const result = { created: 2, skipped: 0, errors: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockedRunImport.mockResolvedValue(result as never);
});

describe("runImportAction", () => {
  it("doesn't re-render the page for a dry run", async () => {
    await expect(runImportAction("a1", "clients", [], true)).resolves.toEqual({ result });

    expect(mockedRunImport).toHaveBeenCalledWith("a1", "clients", [], true);
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("re-renders the page after a real import, in the same response", async () => {
    await expect(runImportAction("a1", "clients", [], false)).resolves.toEqual({ result });

    expect(mockedRefresh).toHaveBeenCalledOnce();
  });
});
