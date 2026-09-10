import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class values", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values and de-duplicates conflicting tailwind classes", () => {
    expect(cn("p-2", false && "hidden", null, "p-4")).toBe("p-4");
  });
});
