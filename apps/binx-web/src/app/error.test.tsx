import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { reportClientError } = vi.hoisted(() => ({
  reportClientError: vi.fn(),
}));
vi.mock("@/lib/error-reporting", () => ({ reportClientError }));

import ErrorPage from "./error";

describe("ErrorPage", () => {
  beforeEach(() => {
    reportClientError.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("asks crawlers not to index it", () => {
    reportClientError.mockResolvedValue(undefined);
    render(<ErrorPage error={new Error("boom")} retry={() => {}} />);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex");
  });

  it("shows the error-log reference once it's reported", async () => {
    reportClientError.mockResolvedValue("7F3A9C21");
    render(<ErrorPage error={new Error("boom")} retry={() => {}} />);
    expect(await screen.findByText("Reference: 7F3A9C21")).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledWith(expect.any(Error), {
      source: "error-boundary",
    });
  });
});
