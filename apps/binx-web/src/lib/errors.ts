/**
 * errors.ts
 *
 * The shared half of binx-web's error library. Safe on the server and in
 * the browser (no `next/headers`, no SDK imports).
 *
 * - **Reading binx-api errors.** Every binx-api error response has the same
 *   shape (see binx-api `core/errors.py`): `detail` (the message, or a list
 *   of validation errors on a 422), a machine-readable `code`, the
 *   `request_id`, and for an unexpected error a `reference` the customer can
 *   quote to support. {@link readApiError} pulls those out, and
 *   {@link withReference} is how a reference is shown to people.
 * - **Describing a thrown value** for a report ({@link describeError}), and
 *   deciding what's just browser noise ({@link isNoise}).
 *
 * The rest lives in `error-reporting.ts` (browser), `error-reporting-server.ts`
 * (Next server) and `app/api/errors/route.ts` (the browser → binx-api relay).
 *
 * @module apps/binx-web/src/lib/errors.ts
 * @author Binx Portal
 */

/** The machine-readable `code` on a binx-api error. Open-ended: a route can
 * use a more specific one (`"already_invited"`), so treat this as a hint. */
export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "payment_required"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "validation_error"
  | "rate_limited"
  | "internal_error"
  | "upstream_error"
  | "service_unavailable"
  | (string & {});

export interface ApiErrorMeta {
  code?: ApiErrorCode;
  requestId?: string;
  /** Only on errors binx-api reported (5xx): "7F3A9C21". */
  reference?: string;
}

/** An 8-hex-digit reference, as binx-api's `new_reference` makes them. */
export const REFERENCE_PATTERN = /^[0-9A-F]{8}$/;
/** How {@link withReference} ends a message. */
const TRAILING_REFERENCE = /Reference: [0-9A-F]{8}\.?$/;

function stringField(data: unknown, key: string): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}

/** The `code`, `request_id` and `reference` from a binx-api error body.
 * Anything missing (an older API, a proxy's HTML error page) is undefined. */
export function readApiError(data: unknown): ApiErrorMeta {
  const reference = stringField(data, "reference");
  return {
    code: stringField(data, "code"),
    requestId: stringField(data, "request_id"),
    reference:
      reference && REFERENCE_PATTERN.test(reference) ? reference : undefined,
  };
}

/** "Something went wrong on our end. Reference: 7F3A9C21". The one place
 * the wording lives, so support always knows what to ask for. */
export function withReference(message: string, reference?: string): string {
  if (!reference || TRAILING_REFERENCE.test(message)) return message;
  const sentence = /[.!?]$/.test(message.trim())
    ? message.trim()
    : `${message.trim()}.`;
  return `${sentence} Reference: ${reference}`;
}

/** True when a message already carries a binx-api reference, i.e. the
 * error was recorded by binx-api and reporting it again would double-count. */
export function hasReference(message: string): boolean {
  return TRAILING_REFERENCE.test(message);
}

export interface ErrorDescription {
  errorType: string;
  message: string;
  stack?: string;
  /** Next's server-error digest, when the error came through React. */
  digest?: string;
}

const MAX_MESSAGE = 2000;
const MAX_STACK = 20_000;

/** Whatever was thrown (not always an Error: a string, a rejected value, a
 * DOM event), turned into something a report can carry. */
export function describeError(error: unknown): ErrorDescription {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    return {
      errorType: (error.name || "Error").slice(0, 255),
      message: (error.message || error.name || "Error").slice(0, MAX_MESSAGE),
      stack: error.stack ? error.stack.slice(0, MAX_STACK) : undefined,
      digest: typeof digest === "string" ? digest.slice(0, 64) : undefined,
    };
  }
  if (typeof error === "string") {
    return {
      errorType: "Error",
      message: error.slice(0, MAX_MESSAGE) || "Error",
    };
  }
  let message: string;
  try {
    message = JSON.stringify(error) ?? String(error);
  } catch {
    message = String(error);
  }
  return {
    errorType: "NonError",
    message: message.slice(0, MAX_MESSAGE) || "Unknown error",
  };
}

/**
 * Errors the browser throws at us that aren't our bugs: a page-enter view
 * transition being abandoned (components/ui/PageEnter; the page still
 * renders), the benign ResizeObserver loop warning, and anything from a
 * browser extension's own scripts.
 */
const NOISE = [
  /Transition was aborted because of invalid state/,
  /Transition was skipped/,
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/,
  /^Script error\.?$/,
];
const EXTENSION_STACK = /(chrome|moz|safari(-web)?)-extension:\/\//;

export function isNoise(description: ErrorDescription): boolean {
  if (NOISE.some((pattern) => pattern.test(description.message))) return true;
  return Boolean(description.stack && EXTENSION_STACK.test(description.stack));
}

/** The view-transition patterns on their own, for Sentry's `ignoreErrors`. */
export const VIEW_TRANSITION_NOISE = NOISE.slice(0, 2);

/** The body binx-api's `POST /errors/report` takes. */
export interface WebErrorReport {
  runtime: "browser" | "server";
  level?: "warning" | "error" | "fatal";
  error_type: string;
  message: string;
  stack?: string;
  path?: string;
  route?: string;
  route_type?: string;
  method?: string;
  digest?: string;
  release?: string;
  environment?: string;
  sentry_event_id?: string;
  user_agent?: string;
  request_id?: string;
}

/** The build this is (the git SHA in CI), shared with Sentry's `release`. */
export const RELEASE = process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined;
export const ENVIRONMENT =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development";
