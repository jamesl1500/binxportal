import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LONG_PRESS_MS, TAP_SLOP_PX, useTouchRowGestures } from "./useTouchRowGestures";

function Row({
  enabled = true,
  onTap,
  onLongPress,
  onDouble,
}: {
  enabled?: boolean;
  onTap: () => void;
  onLongPress: () => void;
  onDouble?: (touch: boolean) => void;
}) {
  const { handlers, isTouchInput } = useTouchRowGestures({ enabled, onTap, onLongPress });
  return (
    <ul>
      <li data-testid="row" {...handlers}>
        <span data-testid="title" onDoubleClick={() => onDouble?.(isTouchInput())}>
          Task
        </span>
        <button type="button" data-testid="check">
          ✓
        </button>
      </li>
    </ul>
  );
}

const at = (x: number, y = 10) => ({ clientX: x, clientY: y });

function setup(props: { enabled?: boolean } = {}) {
  const onTap = vi.fn();
  const onLongPress = vi.fn();
  render(<Row {...props} onTap={onTap} onLongPress={onLongPress} />);
  return { onTap, onLongPress, row: screen.getByTestId("row"), title: screen.getByTestId("title") };
}

function press(el: Element, pointerType: string, x = 10) {
  fireEvent.pointerDown(el, { pointerType, pointerId: 1, ...at(x) });
}
function release(el: Element, x = 10) {
  fireEvent.pointerUp(el, { pointerId: 1, ...at(x) });
  fireEvent.click(el, at(x));
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useTouchRowGestures", () => {
  it("a touch tap anywhere on the row is a tap", () => {
    const { onTap, onLongPress, title } = setup();
    press(title, "touch");
    release(title);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("pen counts as touch", () => {
    const { onTap, title } = setup();
    press(title, "pen");
    release(title);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("ignores mouse entirely (desktop keeps the checkbox, ⋯ and double-click)", () => {
    const { onTap, onLongPress, title } = setup();
    press(title, "mouse");
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    release(title);
    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does nothing when disabled (read-only viewer)", () => {
    const { onTap, onLongPress, title } = setup({ enabled: false });
    press(title, "touch");
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    release(title);
    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("leaves presses on interactive children to them (no double toggle via the checkbox)", () => {
    const { onTap, onLongPress } = setup();
    const check = screen.getByTestId("check");
    press(check, "touch");
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    release(check);
    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("holding still opens the menu, and lifting afterwards is not also a tap", () => {
    const { onTap, onLongPress, title } = setup();
    press(title, "touch");
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 1));
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    release(title);
    expect(onTap).not.toHaveBeenCalled();
  });

  it("a quick release cancels the long press", () => {
    const { onLongPress, title } = setup();
    press(title, "touch");
    release(title);
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("dragging the card (moves tracked on window) is neither a tap nor a long press", () => {
    const { onTap, onLongPress, title } = setup();
    press(title, "touch", 10);
    // The canvas moves the card; the row may not receive the moves itself.
    fireEvent.pointerMove(window, { pointerId: 1, ...at(10 + TAP_SLOP_PX + 1) });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    release(title, 60);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });

  it("a release beyond the drag threshold is not a tap even if no move was seen", () => {
    const { onTap, title } = setup();
    press(title, "touch", 10);
    release(title, 10 + TAP_SLOP_PX + 1);
    expect(onTap).not.toHaveBeenCalled();
  });

  it("jitter within the threshold still counts as a tap", () => {
    const { onTap, title } = setup();
    press(title, "touch", 10);
    fireEvent.pointerMove(window, { pointerId: 1, ...at(10 + TAP_SLOP_PX) });
    release(title, 10 + TAP_SLOP_PX);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("ignores moves from a different pointer (second finger)", () => {
    const { onLongPress, title } = setup();
    press(title, "touch");
    fireEvent.pointerMove(window, { pointerId: 2, ...at(200) });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("pointercancel (e.g. the browser took over for a pinch) drops the press", () => {
    const { onTap, onLongPress, title } = setup();
    press(title, "touch");
    fireEvent.pointerCancel(title, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.click(title, at(10));
    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("suppresses the OS context menu during a touch press only", () => {
    const { row, title } = setup();
    press(title, "touch");
    expect(fireEvent.contextMenu(row)).toBe(false); // default prevented
    release(title);
    expect(fireEvent.contextMenu(row)).toBe(true);
  });

  it("a click with no preceding press (keyboard Enter, scripted) is not a tap", () => {
    const { onTap, title } = setup();
    fireEvent.click(title, at(10));
    expect(onTap).not.toHaveBeenCalled();
  });

  it("isTouchInput reports the latest press type (so double-click rename stays mouse-only)", () => {
    const onDouble = vi.fn();
    render(<Row onTap={vi.fn()} onLongPress={vi.fn()} onDouble={onDouble} />);
    const title = screen.getByTestId("title");

    press(title, "touch");
    release(title);
    fireEvent.doubleClick(title);
    press(title, "mouse");
    release(title);
    fireEvent.doubleClick(title);

    expect(onDouble.mock.calls).toEqual([[true], [false]]);
  });

  it("clears its timer and window listener on unmount", () => {
    const onLongPress = vi.fn();
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Row onTap={vi.fn()} onLongPress={onLongPress} />);
    press(screen.getByTestId("title"), "touch");
    unmount();
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    expect(onLongPress).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
    removeSpy.mockRestore();
  });
});
