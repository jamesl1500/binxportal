import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ClientStatGrid from "./ClientStatGrid";

describe("ClientStatGrid", () => {
  it("renders each stat's label, value, tone and optional hint", () => {
    render(
      <ClientStatGrid
        stats={[
          { label: "Outstanding", value: "$1,000", hint: "2 open", tone: "warn" },
          { label: "Projects", value: "3" },
        ]}
      />,
    );

    expect(screen.getByText("Outstanding")).toBeInTheDocument();
    const value = screen.getByText("$1,000");
    expect(value).toHaveAttribute("data-tone", "warn");
    expect(screen.getByText("2 open")).toBeInTheDocument();

    expect(screen.getByText("3")).toHaveAttribute("data-tone", "default");
    expect(screen.queryByText("2 open")).toBeInTheDocument();
  });
});
