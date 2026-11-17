/**
 * file-proxy.ts - Shared hardening for the `app/api/**` routes that stream
 * stored files (avatars, logos, covers, board images, task/project files,
 * message attachments) from binx-api back to the browser.
 *
 * Those routes serve user-uploaded bytes from THIS app's origin, the same
 * origin that holds the session cookie and runs server actions. So they never
 * trust the upstream headers blindly:
 *
 * - `apiPath` percent-encodes every interpolated path segment. A route param
 *   like `..%2F..%2Fusers` is decoded by Next to `../../users`, and
 *   interpolated raw it would walk the upstream URL to a different binx-api
 *   endpoint, called with the viewer's bearer token.
 * - `fileResponseHeaders` only lets a short allowlist of raster image / PDF
 *   types render inline. Anything else (HTML, SVG, XML, unknown) is forced to
 *   a download. Every response also gets `nosniff` and a sandboxing CSP, so
 *   even a mislabelled file opened directly can't run script on this origin.
 * - `upstreamErrorBody` decodes an `arraybuffer` error body without throwing
 *   when it isn't JSON (e.g. a proxy's HTML 502 page).
 *
 * @module apps/binx-web/src/lib/file-proxy.ts
 */

/** Template tag: `apiPath\`/agencies/${id}/logo\`` with every value encoded. */
export function apiPath(strings: TemplateStringsArray, ...values: Array<string | number>): string {
  return strings.reduce(
    (out, chunk, i) => out + chunk + (i < values.length ? encodeURIComponent(String(values[i])) : ""),
    "",
  );
}

const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * True when a request path has a `.`/`..` segment (plain or percent-encoded),
 * i.e. it could resolve to a different binx-api endpoint than the one its
 * template names. No legitimate binx-api path contains one. `lib/api.ts`
 * refuses to send such a request, which covers every call site that
 * interpolates route params into a path, not only the ones using `apiPath`.
 */
export function hasDotSegment(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split(/[?#]/, 1)[0];
  return path.split(/[\\/]/).some((segment) => DOT_SEGMENT.test(segment));
}

/**
 * Types that are safe to render inline from this origin: they cannot carry
 * script. Deliberately NOT here: image/svg+xml, text/html, text/xml,
 * application/xhtml+xml, and anything unknown.
 */
export const INLINE_SAFE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heic",
  "application/pdf",
]);

/**
 * Applied to every proxied file. `sandbox` stops a document opened directly
 * from running script or reaching same-origin state. `img-src`/`media-src`
 * keep a raster image or PDF that's opened in its own tab rendering.
 */
export const FILE_RESPONSE_CSP =
  "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";

type UpstreamHeaders = Record<string, unknown> | { get?: unknown };

function header(headers: UpstreamHeaders, name: string): string | undefined {
  const value = (headers as Record<string, unknown>)[name];
  if (value === undefined || value === null) return undefined;
  return String(Array.isArray(value) ? value[0] : value);
}

/** Lower-cased media type with parameters stripped: "image/PNG; x=1" → "image/png". */
export function mediaType(contentType: string | undefined): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

/** Keep only the `filename`/`filename*` params of a disposition, with a new type. */
function withDispositionType(disposition: string | undefined, type: "inline" | "attachment"): string {
  const params = (disposition ?? "")
    .split(";")
    .slice(1)
    .map((p) => p.trim())
    .filter((p) => /^filename\*?=/i.test(p));
  return [type, ...params].join("; ");
}

export interface FileResponseOptions {
  /** Content-Type when upstream sends none. */
  fallbackType: string;
  /** Disposition when upstream sends none. Defaults to `attachment`. */
  defaultDisposition?: "inline" | "attachment";
  /** e.g. "private, max-age=86400" for version-busted image URLs. */
  cacheControl?: string;
}

export function fileResponseHeaders(
  upstream: UpstreamHeaders,
  { fallbackType, defaultDisposition = "attachment", cacheControl = "private, no-store" }: FileResponseOptions,
): Record<string, string> {
  const contentType = header(upstream, "content-type") ?? fallbackType;
  const upstreamDisposition = header(upstream, "content-disposition");

  const wantsInline = upstreamDisposition
    ? /^\s*inline\b/i.test(upstreamDisposition)
    : defaultDisposition === "inline";
  const inline = wantsInline && INLINE_SAFE_TYPES.has(mediaType(contentType));

  const headers: Record<string, string> = {
    // An inline-unsafe type is downgraded to an opaque download, so the
    // browser has nothing it could render (or sniff) as a document.
    "Content-Type": inline || !wantsInline ? contentType : "application/octet-stream",
    "Content-Disposition": withDispositionType(upstreamDisposition, inline ? "inline" : "attachment"),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": FILE_RESPONSE_CSP,
    "Cache-Control": cacheControl,
  };
  // Content-Length is deliberately not forwarded: axios may have decoded a
  // compressed upstream body, so the upstream length can be wrong.
  return headers;
}

/** Decode an axios `arraybuffer` error body to JSON when possible, never throwing. */
export function upstreamErrorBody(data: unknown): unknown {
  // Tag check rather than `instanceof`: realm-safe (jsdom, workers, vm).
  const isBuffer = Object.prototype.toString.call(data) === "[object ArrayBuffer]";
  if (!isBuffer && !ArrayBuffer.isView(data)) return data;
  try {
    const bytes = isBuffer
      ? new Uint8Array(data as ArrayBuffer)
      : new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}
