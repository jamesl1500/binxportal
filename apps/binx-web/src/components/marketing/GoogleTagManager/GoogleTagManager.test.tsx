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
  it("sets Consent Mode defaults and the saved choice before loading the container", () => {
    const script = gtmBootstrap("GTM-MKJJJHG5");
    const optInDefault = script.indexOf("gtag('consent','default',{analytics_storage:'denied'");
    const globalDefault = script.indexOf("gtag('consent','default',{analytics_storage:'granted'");
    const savedChoice = script.indexOf("gtag('consent','update'");
    const loader = script.indexOf("googletagmanager.com/gtm.js");
    expect(optInDefault).toBeGreaterThan(-1);
    expect(globalDefault).toBeGreaterThan(optInDefault);
    expect(savedChoice).toBeGreaterThan(globalDefault);
    expect(loader).toBeGreaterThan(savedChoice);
    expect(script).toContain('region:["AT",');
    expect(script).toContain('"GB","CH"]');
    expect(script).not.toContain("ad_storage:'granted'");
    expect(script).toContain('"GTM-MKJJJHG5"');
  });

  it("reads the saved choice with a regex that runs", () => {
    const script = gtmBootstrap("GTM-MKJJJHG5");
    const source = /document\.cookie\.match\((\/.*\/)\);/.exec(script)?.[1];
    expect(source).toBeDefined();
    // Evaluate the bootstrap's own regex literal, exactly as the browser will.
    const pattern = new Function(`return ${source}`)() as RegExp;
    expect(pattern.exec("a=1; binx_consent=denied; b=2")?.[1]).toBe("denied");
    expect(pattern.exec("other_binx_consent=granted")).toBeNull();
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
