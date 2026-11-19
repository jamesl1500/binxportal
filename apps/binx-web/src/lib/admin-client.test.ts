import { describe, expect, it } from "vitest";

import {
  adminHref,
  auditActionLabel,
  auditTargetHref,
  parseOffset,
} from "@/lib/admin-client";

describe("adminHref", () => {
  it("drops empty values and the zero offset", () => {
    expect(adminHref("/admin/users", { q: "", filter: undefined, offset: 0 })).toBe(
      "/admin/users",
    );
    expect(adminHref("/admin/users", { q: "dana", filter: "portal", offset: 25 })).toBe(
      "/admin/users?q=dana&filter=portal&offset=25",
    );
  });

  it("keeps a false boolean (it's a real filter value)", () => {
    expect(adminHref("/admin/agencies", { trialing: false })).toBe(
      "/admin/agencies?trialing=false",
    );
  });

  it("encodes the query", () => {
    expect(adminHref("/admin/search", { q: "a&b c" })).toBe("/admin/search?q=a%26b+c");
  });
});

describe("parseOffset", () => {
  it("accepts non-negative integers and rejects junk", () => {
    expect(parseOffset("50")).toBe(50);
    expect(parseOffset("-5")).toBe(0);
    expect(parseOffset("abc")).toBe(0);
    expect(parseOffset(undefined)).toBe(0);
  });
});

describe("audit helpers", () => {
  it("labels known actions and falls back for new ones", () => {
    expect(auditActionLabel("password_reset_sent")).toBe("Password reset sent");
    expect(auditActionLabel("something_new")).toBe("something new");
  });

  it("links each target type to its console page", () => {
    expect(auditTargetHref({ target_type: "agency", target_id: "a1" })).toBe("/admin/agencies/a1");
    expect(auditTargetHref({ target_type: "user", target_id: "u1" })).toBe("/admin/users/u1");
  });
});
