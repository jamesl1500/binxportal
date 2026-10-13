import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { skyPhaseFor } from "@/lib/portal-insights";

import PortalAuthSky, { skyPhaseScript } from "./PortalAuthSky";

afterEach(() => {
  vi.useRealTimers();
});

describe("skyPhaseFor", () => {
  it("moves from sunrise to daylight to sunset to night, wrapping past midnight", () => {
    expect([4, 5, 11, 12, 16, 17, 19, 20, 23, 0].map(skyPhaseFor)).toEqual([
      "night",
      "morning",
      "morning",
      "day",
      "day",
      "evening",
      "evening",
      "night",
      "night",
      "night",
    ]);
  });
});

describe("skyPhaseScript", () => {
  // The inline script runs before any bundle loads, so it can't import
  // skyPhaseFor — make sure the generated source agrees with it all day.
  it("sets the same phase as skyPhaseFor for every hour", () => {
    const run = new Function("Date", "document", skyPhaseScript());

    for (let hour = 0; hour < 24; hour += 1) {
      const root = { dataset: {} as Record<string, string> };
      const FakeDate = class {
        getHours() {
          return hour;
        }
      };
      run(FakeDate, { currentScript: { parentElement: root } });

      expect(root.dataset.phase, `hour ${hour}`).toBe(skyPhaseFor(hour));
    }
  });
});

describe("PortalAuthSky", () => {
  it("tags its root with the viewer's current phase", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 22, 30));

    const { container } = render(
      <PortalAuthSky className="root">
        <p>Sign in</p>
      </PortalAuthSky>,
    );

    expect(container.firstElementChild).toHaveAttribute("data-phase", "night");
    expect(container.firstElementChild).toHaveTextContent("Sign in");
  });
});
