import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MemberMultiSelect from "./MemberMultiSelect";

const members = [
  { user_id: "u1", full_name: "Ada Lovelace", email: "ada@x.test", job_title: "Lead" },
  { user_id: "u2", full_name: "Alan Turing", email: "alan@x.test", job_title: null },
  { user_id: "u3", full_name: "Grace Hopper", email: "grace@x.test", job_title: null },
] as never;

describe("MemberMultiSelect", () => {
  it("filters by name or email", async () => {
    render(<MemberMultiSelect members={members} selected={new Set()} onChange={vi.fn()} />);
    await userEvent.type(screen.getByRole("searchbox"), "alan@x");
    expect(screen.getByText("Alan Turing")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
  });

  it("hides excluded members and shows an empty state", async () => {
    render(
      <MemberMultiSelect
        members={members}
        selected={new Set()}
        onChange={vi.fn()}
        exclude={new Set(["u1", "u2", "u3"])}
      />,
    );
    expect(screen.getByText("No teammates match.")).toBeInTheDocument();
  });

  it("toggles a member in and out of the selected set", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MemberMultiSelect members={members} selected={new Set()} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));
    expect(onChange).toHaveBeenCalledWith(new Set(["u1"]));

    rerender(<MemberMultiSelect members={members} selected={new Set(["u1"])} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));
    expect(onChange).toHaveBeenLastCalledWith(new Set());
  });
});
