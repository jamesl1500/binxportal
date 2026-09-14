import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ExperienceEntry } from "@/lib/users";

import ExperienceEntryList from "./ExperienceEntryList";

const entry: ExperienceEntry = {
  id: "exp-1",
  title: "Senior Developer",
  organization: "Acme Co.",
  start_year: 2021,
  end_year: null,
  description: "Led the platform rewrite.",
};

describe("ExperienceEntryList", () => {
  it("renders an existing entry's fields", () => {
    render(<ExperienceEntryList value={[entry]} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("Senior Developer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Acme Co.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2021")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Present" })).toBeChecked();
  });

  it("adds a blank entry when 'Add experience' is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceEntryList value={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /add experience/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [added] = onChange.mock.calls[0][0];
    expect(added).toMatchObject({ title: "", organization: "", end_year: null });
    expect(added.id).toBeTruthy();
  });

  it("removes an entry when its Remove button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceEntryList value={[entry]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("updates a field in place without touching the rest of the entry", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceEntryList value={[entry]} onChange={onChange} />);

    // A controlled input with no backing state in this test always shows
    // the original value, so one keystroke is enough to prove `update`
    // patches just the changed field and leaves the rest of the entry alone.
    await user.type(screen.getByLabelText("Organization"), "!");

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0]).toMatchObject({ ...entry, organization: "Acme Co.!" });
  });

  it("un-checking Present re-enables the end year field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExperienceEntryList value={[entry]} onChange={onChange} />);

    await user.click(screen.getByRole("checkbox", { name: "Present" }));
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].end_year).not.toBeNull();
  });
});
