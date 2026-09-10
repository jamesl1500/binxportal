import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import BarChart from "./BarChart";

const data = [
  { label: "Jan", value: 3 },
  { label: "Feb", value: 8 },
  { label: "Mar", value: 5 },
];

describe("BarChart", () => {
  it("renders an accessible SVG with a bar per datum", () => {
    const { container } = render(<BarChart ariaLabel="Invoices per month" data={data} />);

    expect(screen.getByRole("img", { name: "Invoices per month" })).toBeInTheDocument();
    expect(container.querySelectorAll("rect")).toHaveLength(3);
  });

  it("reveals a tooltip on hover", async () => {
    const user = userEvent.setup();
    const { container } = render(<BarChart ariaLabel="Invoices per month" data={data} valueFormat="currency" />);

    await user.hover(container.querySelectorAll("rect")[1]);
    expect(screen.getByRole("status")).toHaveTextContent("$8");
  });

  it("shows an empty state with no data", () => {
    render(<BarChart ariaLabel="Empty" data={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
