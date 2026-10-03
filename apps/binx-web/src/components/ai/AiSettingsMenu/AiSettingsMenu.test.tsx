import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AiPreferences } from "@/lib/ai";

import AiSettingsMenu from "./AiSettingsMenu";

const preferences: AiPreferences = {
  response_length: "balanced",
  tone: "professional",
  allow_actions: true,
  confirm_actions: true,
  voice_auto_send: true,
  custom_instructions: null,
};

describe("AiSettingsMenu", () => {
  it("is disabled until preferences have loaded", () => {
    render(<AiSettingsMenu preferences={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "AI settings" })).toBeDisabled();
  });

  it("reports each change as a full preferences object", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AiSettingsMenu preferences={preferences} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "AI settings" }));
    await user.click(await screen.findByRole("radio", { name: "Friendly" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...preferences, tone: "friendly" });

    await user.click(screen.getByRole("switch", { name: "Send voice messages automatically" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...preferences, voice_auto_send: false });
  });

  it("saves custom instructions on blur, trimmed", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AiSettingsMenu preferences={preferences} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "AI settings" }));

    await user.type(await screen.findByRole("textbox", { name: "Custom instructions" }), "  Use bullet points. ");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith({ ...preferences, custom_instructions: "Use bullet points." });
  });

  it("doesn't save custom instructions that didn't change", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AiSettingsMenu preferences={{ ...preferences, custom_instructions: "Be brief." }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "AI settings" }));

    await user.click(await screen.findByRole("textbox", { name: "Custom instructions" }));
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables the approval toggle while changes are off", async () => {
    const user = userEvent.setup();
    render(<AiSettingsMenu preferences={{ ...preferences, allow_actions: false }} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "AI settings" }));

    expect(await screen.findByRole("switch", { name: "Ask before each change" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
