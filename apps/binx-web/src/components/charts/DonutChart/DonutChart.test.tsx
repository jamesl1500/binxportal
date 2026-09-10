import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DonutChart from "./DonutChart";

describe("DonutChart", () => {
  it("renders an accessible image with a legend entry per segment", () => {
    render(
      <DonutChart
        ariaLabel="Invoices by status"
        segments={[
          { label: "Paid", value: 6, color: "#0a0a0b", hint: "$30k" },
          { label: "Overdue", value: 2, color: "#dc2626" },
        ]}
        centerPrimary="8"
        centerSecondary="Invoices"
      />,
    );

    expect(screen.getByRole("img", { name: "Invoices by status" })).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("$30k")).toBeInTheDocument();
    // identity is never colour-alone: labels + values are present
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("still renders the legend when every value is zero", () => {
    render(
      <DonutChart
        ariaLabel="Empty"
        segments={[
          { label: "Paid", value: 0, color: "#0a0a0b" },
          { label: "Draft", value: 0, color: "#a1a1aa" },
        ]}
      />,
    );
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });
});
