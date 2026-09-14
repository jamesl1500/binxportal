import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SkillsInput from "./SkillsInput";

describe("SkillsInput", () => {
  it("renders existing skills as chips", () => {
    render(<SkillsInput value={["Python", "React"]} onChange={vi.fn()} />);
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
  });

  it("adds a skill on Enter and clears the draft", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SkillsInput value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/e.g. python/i);
    await user.type(input, "Figma{Enter}");

    expect(onChange).toHaveBeenCalledWith(["Figma"]);
  });

  it("does not add a duplicate or empty skill", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SkillsInput value={["Figma"]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/add another/i);
    await user.type(input, "Figma{Enter}");
    expect(onChange).not.toHaveBeenCalled();

    await user.type(input, "{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a skill when its chip's remove button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SkillsInput value={["Python", "React"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remove Python" }));
    expect(onChange).toHaveBeenCalledWith(["React"]);
  });

  it("stops accepting new skills once the max is reached", () => {
    render(<SkillsInput value={["a", "b"]} onChange={vi.fn()} max={2} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
