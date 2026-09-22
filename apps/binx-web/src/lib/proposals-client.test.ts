import { describe, expect, it } from "vitest";

import { proposalStatusLabel } from "@/lib/proposals-client";

describe("proposalStatusLabel", () => {
  it.each([
    ["draft", "Draft"],
    ["sent", "Sent"],
    ["viewed", "Viewed"],
    ["signed", "Signed"],
    ["declined", "Declined"],
    ["expired", "Expired"],
  ])("labels %s as %s", (status, label) => {
    expect(proposalStatusLabel(status)).toBe(label);
  });

  it("falls back to the raw value for an unknown status", () => {
    expect(proposalStatusLabel("mystery")).toBe("mystery");
  });
});
