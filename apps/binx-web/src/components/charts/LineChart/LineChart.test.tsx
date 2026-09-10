import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LineChart from "./LineChart";

describe("LineChart", () => {
  it("renders an accessible SVG with x-axis ticks", () => {
    render(
      <LineChart
        ariaLabel="Revenue over time"
        data={[
          { label: "Jan", value: 10 },
          { label: "Feb", value: 40 },
          { label: "Mar", value: 25 },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "Revenue over time" })).toBeInTheDocument();
    expect(screen.getByText("Jan")).toBeInTheDocument();
  });

  it("shows an empty state with no data", () => {
    render(<LineChart ariaLabel="Empty" data={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
