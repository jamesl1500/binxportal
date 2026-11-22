import { describe, expect, it } from "vitest";

import {
  describeError,
  hasReference,
  isNoise,
  readApiError,
  withReference,
} from "./errors";

describe("readApiError", () => {
  it("reads binx-api's error body", () => {
    expect(
      readApiError({
        detail: "Something went wrong on our end.",
        code: "internal_error",
        request_id: "abc123",
        reference: "7F3A9C21",
      }),
    ).toEqual({
      code: "internal_error",
      requestId: "abc123",
      reference: "7F3A9C21",
    });
  });

  it("ignores anything that isn't a well-formed reference", () => {
    expect(readApiError({ reference: "<script>" }).reference).toBeUndefined();
    expect(readApiError("<html>502</html>")).toEqual({
      code: undefined,
      requestId: undefined,
      reference: undefined,
    });
    expect(readApiError(undefined).code).toBeUndefined();
  });
});

describe("withReference", () => {
  it("ends the message with the reference, as one sentence", () => {
    expect(withReference("Something went wrong on our end.", "7F3A9C21")).toBe(
      "Something went wrong on our end. Reference: 7F3A9C21",
    );
    expect(withReference("The AI request failed", "7F3A9C21")).toBe(
      "The AI request failed. Reference: 7F3A9C21",
    );
  });

  it("leaves the message alone without a reference, or with one already", () => {
    expect(withReference("Not found", undefined)).toBe("Not found");
    const once = withReference("Oops.", "7F3A9C21");
    expect(withReference(once, "7F3A9C21")).toBe(once);
    expect(hasReference(once)).toBe(true);
    expect(hasReference("Oops.")).toBe(false);
  });
});

describe("describeError", () => {
  it("describes an Error, including Next's digest", () => {
    const error = Object.assign(new TypeError("x is undefined"), {
      digest: "12345",
    });
    expect(describeError(error)).toMatchObject({
      errorType: "TypeError",
      message: "x is undefined",
      digest: "12345",
    });
    expect(describeError(error).stack).toContain("TypeError");
  });

  it("copes with things that aren't Errors", () => {
    expect(describeError("plain string")).toEqual({
      errorType: "Error",
      message: "plain string",
    });
    expect(describeError({ code: 42 })).toEqual({
      errorType: "NonError",
      message: '{"code":42}',
    });
    expect(describeError(undefined).message).toBe("undefined");
  });

  it("caps the size", () => {
    expect(describeError(new Error("x".repeat(5000))).message).toHaveLength(
      2000,
    );
  });
});

describe("isNoise", () => {
  it("filters browser noise, not our bugs", () => {
    expect(isNoise(describeError(new Error("Transition was skipped")))).toBe(
      true,
    );
    expect(
      isNoise(describeError(new Error("ResizeObserver loop limit exceeded"))),
    ).toBe(true);
    expect(isNoise(describeError("Script error."))).toBe(true);
    const fromExtension = new Error("boom");
    fromExtension.stack =
      "Error: boom\n    at chrome-extension://abc/content.js:1:1";
    expect(isNoise(describeError(fromExtension))).toBe(true);
    expect(isNoise(describeError(new TypeError("x is undefined")))).toBe(false);
  });
});
