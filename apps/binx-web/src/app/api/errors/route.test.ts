import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
const getAccessToken = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { post: (...args: unknown[]) => post(...args) },
}));
vi.mock("@/lib/auth", () => ({ getAccessToken: () => getAccessToken() }));

import { POST, sanitizeReport } from "./route";

function request(body: string) {
  return new NextRequest("http://localhost/api/errors", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: { reference: "7F3A9C21" } });
  getAccessToken.mockReset().mockResolvedValue("tok");
});

describe("sanitizeReport", () => {
  it("keeps the known fields, truncated, and forces runtime to browser", () => {
    const report = sanitizeReport({
      runtime: "server",
      level: "fatal",
      error_type: "TypeError",
      message: "x".repeat(3000),
      path: "/p",
      evil: "<script>",
      stack: 42,
    });
    expect(report).toEqual({
      runtime: "browser",
      level: "fatal",
      error_type: "TypeError",
      message: "x".repeat(2000),
      path: "/p",
    });
  });

  it("rejects what isn't a report", () => {
    expect(sanitizeReport(null)).toBeNull();
    expect(sanitizeReport({ message: 1 })).toBeNull();
    expect(sanitizeReport({ message: "" })).toBeNull();
    expect(sanitizeReport({ message: "x", level: "shrug" })?.level).toBe(
      "error",
    );
  });
});

describe("POST /api/errors", () => {
  it("relays to binx-api with the signed-in user's token", async () => {
    const res = await POST(
      request(JSON.stringify({ message: "boom", error_type: "Error" })),
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ reference: "7F3A9C21" });
    expect(post).toHaveBeenCalledWith(
      "/errors/report",
      expect.objectContaining({ runtime: "browser", message: "boom" }),
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
  });

  it("works signed out", async () => {
    getAccessToken.mockResolvedValueOnce(undefined);
    await POST(request(JSON.stringify({ message: "boom" })));
    expect(post.mock.calls[0][2].headers).toEqual({});
  });

  it("400s on junk, and accepts quietly when binx-api fails", async () => {
    expect((await POST(request("not json"))).status).toBe(400);

    post.mockRejectedValueOnce(new Error("api down"));
    const res = await POST(request(JSON.stringify({ message: "boom" })));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ reference: null });
  });

  it("drops an oversized body without relaying it", async () => {
    const res = await POST(
      request(JSON.stringify({ message: "x".repeat(70_000) })),
    );
    expect(res.status).toBe(202);
    expect(post).not.toHaveBeenCalled();
  });
});
