import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONSENT_COOKIE, readConsent, saveConsent } from "@/lib/consent";

import CookieConsent, { CookieSettingsButton } from "./CookieConsent";

function clearConsentCookie() {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
}

let gtag: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearConsentCookie();
  gtag = vi.fn();
  (window as unknown as { gtag: unknown }).gtag = gtag;
});

afterEach(() => {
  clearConsentCookie();
  delete (window as unknown as { gtag?: unknown }).gtag;
});

describe("readConsent", () => {
  it("finds the choice among other cookies, and ignores anything else", () => {
    expect(readConsent("a=1; binx_consent=granted; b=2")).toBe("granted");
    expect(readConsent("binx_consent=denied")).toBe("denied");
    expect(readConsent("binx_consent=maybe")).toBeNull();
    expect(readConsent("other_binx_consent=granted")).toBeNull();
    expect(readConsent("")).toBeNull();
  });
});

describe("CookieConsent", () => {
  it("asks on a first visit, with Accept and Decline side by side", () => {
    render(<CookieConsent />);
    const banner = screen.getByRole("region", { name: "Cookie preferences" });
    expect(banner).toHaveTextContent("Can we use analytics cookies?");
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
  });

  it("Accept saves the choice, updates Consent Mode and closes", async () => {
    render(<CookieConsent />);
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(readConsent()).toBe("granted");
    expect(gtag).toHaveBeenCalledWith("consent", "update", { analytics_storage: "granted" });
    expect(screen.queryByRole("region", { name: "Cookie preferences" })).not.toBeInTheDocument();
  });

  it("Decline saves 'denied'", async () => {
    render(<CookieConsent />);
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(readConsent()).toBe("denied");
    expect(gtag).toHaveBeenCalledWith("consent", "update", { analytics_storage: "denied" });
  });

  it("stays hidden once a choice is saved, and 'Cookie settings' reopens it showing the current choice", async () => {
    act(() => saveConsent("denied"));
    render(
      <>
        <CookieConsent />
        <CookieSettingsButton />
      </>,
    );
    expect(screen.queryByRole("region", { name: "Cookie preferences" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cookie settings" }));
    expect(screen.getByRole("region", { name: "Cookie preferences" })).toHaveTextContent(
      "Currently: analytics cookies are off.",
    );
    expect(screen.getByRole("button", { name: "Accept" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(readConsent()).toBe("granted");
    expect(screen.queryByRole("region", { name: "Cookie preferences" })).not.toBeInTheDocument();
  });

  it("works when GTM hasn't loaded (no gtag yet)", async () => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    render(<CookieConsent />);
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(readConsent()).toBe("granted");
  });
});
