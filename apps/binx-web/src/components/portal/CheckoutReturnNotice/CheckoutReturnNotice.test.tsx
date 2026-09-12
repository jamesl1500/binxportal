import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

import { toast } from "sonner";
import CheckoutReturnNotice from "./CheckoutReturnNotice";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CheckoutReturnNotice", () => {
  it("renders nothing", () => {
    const { container } = render(<CheckoutReturnNotice status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does nothing when there is no checkout status", () => {
    render(<CheckoutReturnNotice status={undefined} />);
    vi.runAllTimers();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("toasts success and refreshes twice on a success return", () => {
    render(<CheckoutReturnNotice status="success" />);
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Payment received"));
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("toasts a neutral notice and does not refresh on a canceled checkout", () => {
    render(<CheckoutReturnNotice status="cancel" />);
    vi.runAllTimers();
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("canceled"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
