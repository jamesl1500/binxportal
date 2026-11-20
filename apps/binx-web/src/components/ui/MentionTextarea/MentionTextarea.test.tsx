import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MentionTextarea from "./MentionTextarea";

const members = [
  { user_name: "priya-amara", full_name: "Priya Amara" },
  { user_name: "marcus-webb", full_name: "Marcus Webb" },
];

function Harness(props: Partial<Parameters<typeof MentionTextarea>[0]>) {
  const [value, setValue] = useState("");
  return (
    <MentionTextarea value={value} onChange={setValue} members={members} ariaLabel="Body" {...props} />
  );
}

describe("MentionTextarea", () => {
  it("filters by name or handle and inserts the picked handle with the keyboard", async () => {
    render(<Harness />);
    const box = screen.getByLabelText("Body");

    await userEvent.type(box, "thanks @web");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    expect(box).toHaveValue("thanks @marcus-webb ");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("arrows move the selection, Escape closes the picker", async () => {
    render(<Harness />);
    const box = screen.getByLabelText("Body");

    await userEvent.type(box, "@");
    const [first, second] = screen.getAllByRole("option");
    expect(first).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(second).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("modEnter (the default) submits on Cmd/Ctrl+Enter only", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const box = screen.getByLabelText("Body");

    await userEvent.type(box, "line{Enter}more");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue("line\nmore");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("enter mode submits on Enter and keeps Shift+Enter as a newline, but picks first while the picker is open", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} submitOn="enter" menuPlacement="above" />);
    const box = screen.getByLabelText("Body");

    await userEvent.type(box, "hi{Shift>}{Enter}{/Shift}@pri");
    expect(screen.getByRole("listbox")).toHaveAttribute("data-placement", "above");
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue("hi\n@priya-amara ");

    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("forwards its ref to the textarea", () => {
    const ref = { current: null as HTMLTextAreaElement | null };
    render(<Harness ref={ref} />);
    expect(ref.current).toBe(screen.getByLabelText("Body"));
  });
});
