import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardItem, BoardTask } from "@/lib/boards-client";
import { useBoardStore } from "@/stores/use-board-store";
import {
  BoardCanvasContext,
  type BoardCanvasContextValue,
} from "@/components/boards/BoardCanvas/BoardCanvasContext";
import { LONG_PRESS_MS } from "@/hooks/useTouchRowGestures";

import TodoCard, { LIFT_CLICK_WINDOW_MS } from "./TodoCard";

const ITEM = { id: "item-1", content: { title: "Launch" } } as unknown as BoardItem;

const task = (over: Partial<BoardTask> = {}): BoardTask => ({
  id: "t1",
  item_id: "item-1",
  title: "Write copy",
  done: false,
  due_date: null,
  position: 0,
  ...over,
});

function renderCard(viewerKind: "agency" | "client" = "agency") {
  const updateTask = vi.fn(async (_item: string, id: string, patch: { done?: boolean }) => ({
    task: { ...useBoardStore.getState().tasksById[id], ...patch },
  }));
  const todoOptions = vi.fn(async () => ({ tasks: [], members: [] }));
  const value = {
    actions: { updateTask, todoOptions, addTask: vi.fn(), removeTask: vi.fn(), attachTask: vi.fn() },
    viewerKind,
    onError: vi.fn(),
  } as unknown as BoardCanvasContextValue;
  render(
    <BoardCanvasContext.Provider value={value}>
      <TodoCard item={ITEM} autoEdit={false} onSaveTitle={vi.fn()} />
    </BoardCanvasContext.Provider>,
  );
  return { updateTask, todoOptions };
}

const title = () => screen.getByText("Write copy");
const touchTap = (el: Element) => {
  fireEvent.pointerDown(el, { pointerType: "touch", pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.click(el, { clientX: 5, clientY: 5 });
};
const longPress = (el: Element) => {
  fireEvent.pointerDown(el, { pointerType: "touch", pointerId: 1, clientX: 5, clientY: 5 });
  act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.click(el, { clientX: 5, clientY: 5 });
};

beforeEach(() => {
  vi.useFakeTimers();
  useBoardStore.setState({ tasksById: { t1: task() } });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TodoCard touch gestures", () => {
  it("a touch tap on the task title ticks it (the whole row is the target)", () => {
    const { updateTask } = renderCard();
    touchTap(title());
    expect(updateTask).toHaveBeenCalledWith("item-1", "t1", { done: true });
    expect(useBoardStore.getState().tasksById.t1.done).toBe(true); // optimistic
  });

  it("a mouse click on the title does not tick it (desktop uses the checkbox)", () => {
    const { updateTask } = renderCard();
    fireEvent.pointerDown(title(), { pointerType: "mouse", pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.click(title(), { clientX: 5, clientY: 5 });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("a touch tap on the checkbox ticks exactly once", () => {
    const { updateTask } = renderCard();
    touchTap(screen.getByRole("checkbox", { name: /Write copy/ }));
    expect(updateTask).toHaveBeenCalledTimes(1);
  });

  it("long press opens the row menu and loads its options, without ticking", () => {
    const { updateTask, todoOptions } = renderCard();
    expect(screen.queryByRole("menu")).toBeNull();
    longPress(title());
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(todoOptions).toHaveBeenCalledTimes(1);
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("with the menu open, a tap on the row dismisses it instead of ticking", () => {
    const { updateTask } = renderCard();
    longPress(title());
    touchTap(title());
    expect(screen.queryByRole("menu")).toBeNull();
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("a press outside the row, or Escape, closes the menu", () => {
    renderCard();
    longPress(title());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    longPress(title());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("long press opens the menu as a bottom sheet outside the zoomed card", () => {
    renderCard();
    longPress(title());
    const sheet = screen.getByRole("dialog", { name: /Task options for “Write copy”/ });
    expect(sheet.closest("[data-todo-row]")).toBeNull(); // portaled out of the canvas
    expect(document.activeElement).toBe(sheet); // focus moves into the sheet
    for (const name of ["Remove from list", "Delete task"]) {
      expect(screen.getByRole("menuitem", { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Due")).toBeInTheDocument();
    expect(screen.getByLabelText("Assignee")).toBeInTheDocument();
  });

  it("presses inside the sheet keep it open and never tick the task", () => {
    const { updateTask } = renderCard();
    longPress(title());
    const sheet = screen.getByRole("dialog");
    fireEvent.pointerDown(screen.getByLabelText("Due"));
    fireEvent.pointerDown(sheet, { pointerType: "touch", pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.click(sheet, { clientX: 5, clientY: 5 });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("the click from lifting the long-press finger (landing on the new backdrop) doesn't close it", () => {
    renderCard();
    fireEvent.pointerDown(title(), { pointerType: "touch", pointerId: 1, clientX: 5, clientY: 5 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    // The sheet is now under the finger; the browser targets the lift's click at it.
    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.pointerUp(backdrop, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.click(backdrop, { clientX: 5, clientY: 5 });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("the lift-click after a long press can't trigger a sheet action (e.g. Delete task)", () => {
    const removeTask = vi.fn(async () => ({}));
    const value = {
      actions: {
        updateTask: vi.fn(),
        todoOptions: vi.fn(async () => ({ tasks: [], members: [] })),
        removeTask,
      },
      viewerKind: "agency",
      onError: vi.fn(),
    } as unknown as BoardCanvasContextValue;
    render(
      <BoardCanvasContext.Provider value={value}>
        <TodoCard item={ITEM} autoEdit={false} onSaveTitle={vi.fn()} />
      </BoardCanvasContext.Provider>,
    );

    fireEvent.pointerDown(title(), { pointerType: "touch", pointerId: 1, clientX: 5, clientY: 5 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    // The sheet opened under the finger; the lift's click lands on "Delete task".
    const del = screen.getByRole("menuitem", { name: "Delete task" });
    fireEvent.pointerUp(del, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.click(del);
    expect(removeTask).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Once the finger is up and the window has passed, a deliberate tap works.
    act(() => vi.advanceTimersByTime(LIFT_CLICK_WINDOW_MS));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete task" }));
    expect(removeTask).toHaveBeenCalledWith("item-1", "t1", true);
  });

  it("a sheet opened from ⋯ (no finger down) does not swallow the first tap", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn((q: string) => ({ matches: q === "(pointer: coarse)" }) as MediaQueryList);
    try {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: /Task options for/ }));
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });

  it("tapping the backdrop, or Done, closes the sheet", () => {
    renderCard();
    longPress(title());
    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.pointerDown(backdrop, { pointerType: "touch", pointerId: 2 });
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();

    longPress(title());
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renames from the sheet's title field", () => {
    const { updateTask } = renderCard();
    longPress(title());
    const field = screen.getByLabelText("Title");
    fireEvent.change(field, { target: { value: "  Write final copy " } });
    fireEvent.blur(field);
    expect(updateTask).toHaveBeenCalledWith("item-1", "t1", { title: "Write final copy" });
  });

  it("an unchanged or blank title in the sheet is not saved", () => {
    const { updateTask } = renderCard();
    longPress(title());
    const field = screen.getByLabelText("Title");
    fireEvent.blur(field);
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.blur(field);
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("with a mouse, ⋯ opens the anchored menu, whose Rename starts inline editing", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Task options for/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("menu").closest("[data-todo-row]")).not.toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Task title" })).toBeInTheDocument();
  });

  it("on a touch screen, ⋯ (reached by a screen reader) opens the sheet", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn((q: string) => ({ matches: q === "(pointer: coarse)" }) as MediaQueryList);
    try {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: /Task options for/ }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it("double-click renames with a mouse, but a touch double tap does not", () => {
    renderCard();
    touchTap(title());
    touchTap(title());
    fireEvent.doubleClick(title());
    expect(screen.queryByRole("textbox", { name: "Task title" })).toBeNull();

    fireEvent.pointerDown(title(), { pointerType: "mouse", pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.doubleClick(title());
    expect(screen.getByRole("textbox", { name: "Task title" })).toBeInTheDocument();
  });

  it("the ⋯ button still opens the menu (mouse / screen readers)", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Task options for/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("a client (read-only) viewer can't tick or open the menu by touch", () => {
    const { updateTask } = renderCard("client");
    touchTap(title());
    longPress(title());
    expect(updateTask).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
