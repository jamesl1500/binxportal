import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EducationEntry } from "@/lib/users";

import EducationEntryList from "./EducationEntryList";

const entry: EducationEntry = {
  id: "edu-1",
  school: "State University",
  degree: "B.S. Computer Science",
  field_of_study: null,
  start_year: 2014,
  end_year: 2018,
  description: null,
};

describe("EducationEntryList", () => {
  it("renders an existing entry's fields", () => {
    render(<EducationEntryList value={[entry]} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("State University")).toBeInTheDocument();
    expect(screen.getByDisplayValue("B.S. Computer Science")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2014")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2018")).toBeInTheDocument();
  });

  it("adds a blank entry when 'Add education' is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EducationEntryList value={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /add education/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [added] = onChange.mock.calls[0][0];
    expect(added).toMatchObject({ school: "", degree: "", start_year: null, end_year: null });
  });

  it("removes an entry when its Remove button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EducationEntryList value={[entry]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("updates a field in place without touching the rest of the entry", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EducationEntryList value={[entry]} onChange={onChange} />);

    // A controlled input with no backing state in this test always shows
    // the original value, so one keystroke is enough to prove `update`
    // patches just the changed field and leaves the rest of the entry alone.
    await user.type(screen.getByLabelText("Degree"), "!");

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0]).toMatchObject({ ...entry, degree: "B.S. Computer Science!" });
  });
});
