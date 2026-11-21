import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/script", () => ({
  default: ({ id, children }: { id: string; children: string }) => (
    <script data-testid={id} type="text/plain">
      {children}
    </script>
  ),
}));

import GoogleTagManager, { gtmBootstrap, gtmContainerId } from "./GoogleTagManager";

describe("gtmContainerId", () => {
  it("accepts a real container id", () => {
    expect(gtmContainerId("GTM-MKJJJHG5")).toBe("GTM-MKJJJHG5");
    expect(gtmContainerId("  GTM-MKJJJHG5 ")).toBe("GTM-MKJJJHG5");
  });

  it("ignores missing and malformed ids, so nothing odd reaches the inline script", () => {
    expect(gtmContainerId(undefined)).toBeNull();
    expect(gtmContainerId("")).toBeNull();
    expect(gtmContainerId("G-ABC123")).toBeNull(); // a GA4 measurement id, not a container
    expect(gtmContainerId("GTM-ABC');alert(1);//")).toBeNull();
  });
});

describe("gtmBootstrap", () => {
  it("sets Consent Mode defaults before loading the container", () => {
    const script = gtmBootstrap("GTM-MKJJJHG5");
    const consent = script.indexOf("gtag('consent','default'");
    const loader = script.indexOf("googletagmanager.com/gtm.js");
    expect(consent).toBeGreaterThan(-1);
    expect(loader).toBeGreaterThan(consent);
    expect(script).toContain("analytics_storage:'granted'");
    expect(script).toContain("ad_storage:'denied'");
    expect(script).toContain("ad_personalization:'denied'");
    expect(script).toContain('"GTM-MKJJJHG5"');
  });
});

describe("GoogleTagManager", () => {
  it("renders nothing without a container id", () => {
    const { container } = render(<GoogleTagManager containerId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the loader and the no-script fallback", () => {
    const { getByTestId, container } = render(<GoogleTagManager containerId="GTM-MKJJJHG5" />);
    expect(getByTestId("google-tag-manager").textContent).toContain("GTM-MKJJJHG5");
    expect(container.querySelector("noscript")).not.toBeNull();
  });
});
