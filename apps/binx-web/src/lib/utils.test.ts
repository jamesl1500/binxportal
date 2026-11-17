import { describe, expect, it } from "vitest";

import { cn, sameEmail } from "@/lib/utils";

describe("sameEmail", () => {
  it("matches case- and whitespace-insensitively", () => {
    expect(sameEmail("Hello+Client@JamesLatten.com ", "hello+client@jameslatten.com")).toBe(true);
  });

  it("keeps plus-addresses distinct from the base address", () => {
    expect(sameEmail("hello+client@example.com", "hello@example.com")).toBe(false);
  });

  it("is false when either side is missing", () => {
    expect(sameEmail(undefined, "a@b.c")).toBe(false);
    expect(sameEmail("a@b.c", null)).toBe(false);
    expect(sameEmail("", "")).toBe(false);
  });
});

describe("cn", () => {
  it("joins truthy class values", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values and de-duplicates conflicting tailwind classes", () => {
    expect(cn("p-2", false && "hidden", null, "p-4")).toBe("p-4");
  });
});
