import { describe, expect, it } from "vitest";

import {
  apiPath,
  FILE_RESPONSE_CSP,
  fileResponseHeaders,
  hasDotSegment,
  mediaType,
  upstreamErrorBody,
} from "./file-proxy";

describe("apiPath", () => {
  it("passes ordinary ids through unchanged", () => {
    expect(apiPath`/agencies/${"a1"}/projects/${42}/files/${"f-9"}/download`).toBe(
      "/agencies/a1/projects/42/files/f-9/download",
    );
  });

  it("neutralises path traversal in a decoded route param", () => {
    // Next hands the route `..%2F..%2Fusers%2Fme` already decoded.
    const path = apiPath`/agencies/${"a1"}/projects/${"p1"}/files/${"../../../users/me"}/download`;
    expect(path).toBe("/agencies/a1/projects/p1/files/..%2F..%2F..%2Fusers%2Fme/download");
    expect(new URL(path, "http://api.test").pathname).toBe(
      "/agencies/a1/projects/p1/files/..%2F..%2F..%2Fusers%2Fme/download",
    );
  });

  it("encodes query and fragment characters so they can't truncate the path", () => {
    expect(apiPath`/x/${"a?admin=1#y"}/z`).toBe("/x/a%3Fadmin%3D1%23y/z");
  });

  it("works with no interpolations", () => {
    expect(apiPath`/users/me/avatar`).toBe("/users/me/avatar");
  });
});

describe("hasDotSegment", () => {
  it.each([
    "/agencies/a1/projects/../../users/me",
    "/agencies/a1/./logo",
    "/agencies/..",
    "/agencies/%2e%2e/x",
    "/agencies/%2E./x",
    "/agencies/.%2e/x",
    "/agencies\\..\\x",
  ])("flags %j", (url) => {
    expect(hasDotSegment(url)).toBe(true);
  });

  it.each([
    "/agencies/a1/projects/p1/files/f1/download",
    "/agencies/a1/files/..%2F..%2Fx/download", // apiPath-encoded: one opaque segment
    "/agencies/a1/files/report.v2.pdf",
    "/agencies/a1/files/...",
    "/x?next=/../y", // only the path counts
    "",
    undefined,
  ])("allows %j", (url) => {
    expect(hasDotSegment(url)).toBe(false);
  });
});

describe("api client dot-segment guard", () => {
  it("refuses to send a traversal path, and sends a normal one", async () => {
    const { api } = await import("./api");
    const sent: string[] = [];
    const adapter = async (config: import("axios").InternalAxiosRequestConfig) => {
      sent.push(String(config.url));
      return { data: "ok", status: 200, statusText: "OK", headers: {}, config };
    };

    const error = await api.get("/agencies/a1/files/../../users/me/download", { adapter }).catch((e) => e);
    expect(error.isAxiosError).toBe(true);
    expect(error.response).toBeUndefined();
    expect(error.message).toMatch(/dot-segment/);
    await expect(api.get("/agencies/a1/logo", { adapter })).resolves.toMatchObject({ data: "ok" });
    expect(sent).toEqual(["/agencies/a1/logo"]);
  });
});

describe("mediaType", () => {
  it("normalises case and strips parameters", () => {
    expect(mediaType("Image/PNG; charset=binary")).toBe("image/png");
    expect(mediaType(undefined)).toBe("");
  });
});

describe("fileResponseHeaders", () => {
  it("always sets nosniff and the sandboxing CSP", () => {
    const h = fileResponseHeaders({ "content-type": "image/png" }, { fallbackType: "image/png" });
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toBe(FILE_RESPONSE_CSP);
    expect(FILE_RESPONSE_CSP).toMatch(/\bsandbox\b/);
    expect(FILE_RESPONSE_CSP).toMatch(/default-src 'none'/);
  });

  it("serves an allowlisted raster image inline when asked", () => {
    const h = fileResponseHeaders(
      { "content-type": "image/webp" },
      { fallbackType: "image/png", defaultDisposition: "inline", cacheControl: "private, max-age=86400" },
    );
    expect(h["Content-Type"]).toBe("image/webp");
    expect(h["Content-Disposition"]).toBe("inline");
    expect(h["Cache-Control"]).toBe("private, max-age=86400");
  });

  it("forces an SVG that upstream wanted inline to an opaque download", () => {
    const h = fileResponseHeaders(
      { "content-type": "image/svg+xml", "content-disposition": 'inline; filename="x.svg"' },
      { fallbackType: "image/png", defaultDisposition: "inline" },
    );
    expect(h["Content-Disposition"]).toBe('attachment; filename="x.svg"');
    expect(h["Content-Type"]).toBe("application/octet-stream");
  });

  it.each(["text/html", "text/html; charset=utf-8", "application/xhtml+xml", "text/xml", ""])(
    "never renders %j inline",
    (type) => {
      const h = fileResponseHeaders(
        { "content-type": type || undefined },
        { fallbackType: "application/octet-stream", defaultDisposition: "inline" },
      );
      expect(h["Content-Disposition"]).toMatch(/^attachment/);
    },
  );

  it("keeps upstream's attachment disposition and filename for downloads", () => {
    const h = fileResponseHeaders(
      {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename*=utf-8''r%C3%A9sum%C3%A9.pdf",
      },
      { fallbackType: "application/octet-stream" },
    );
    expect(h["Content-Type"]).toBe("application/pdf");
    expect(h["Content-Disposition"]).toBe("attachment; filename*=utf-8''r%C3%A9sum%C3%A9.pdf");
  });

  it("drops anything in the disposition except filename params", () => {
    const h = fileResponseHeaders(
      { "content-type": "image/png", "content-disposition": 'inline; filename="a.png"; evil=1' },
      { fallbackType: "image/png" },
    );
    expect(h["Content-Disposition"]).toBe('inline; filename="a.png"');
  });

  it("defaults to a no-store attachment when upstream sends nothing", () => {
    const h = fileResponseHeaders({}, { fallbackType: "application/octet-stream" });
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"]).toBe("attachment");
    expect(h["Cache-Control"]).toBe("private, no-store");
  });

  it("never forwards Content-Length (axios may have decompressed the body)", () => {
    const h = fileResponseHeaders(
      { "content-type": "image/png", "content-length": "10" },
      { fallbackType: "image/png" },
    );
    expect(h).not.toHaveProperty("Content-Length");
  });
});

describe("upstreamErrorBody", () => {
  const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

  it("decodes a JSON ArrayBuffer body", () => {
    expect(upstreamErrorBody(buf('{"detail":"Not found"}'))).toEqual({ detail: "Not found" });
  });

  it("decodes a Node Buffer view with a non-zero offset", () => {
    const pool = Buffer.from('xxxx{"detail":"Gone"}');
    expect(upstreamErrorBody(pool.subarray(4))).toEqual({ detail: "Gone" });
  });

  it("returns undefined instead of throwing for a non-JSON body (e.g. an HTML 502)", () => {
    expect(upstreamErrorBody(buf("<html>Bad Gateway</html>"))).toBeUndefined();
  });

  it("passes already-parsed data through", () => {
    expect(upstreamErrorBody({ detail: "x" })).toEqual({ detail: "x" });
  });
});
