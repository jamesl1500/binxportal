import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProjectProgress from "./ProjectProgress";

describe("ProjectProgress", () => {
  it("renders the done/total caption and the bar width", () => {
    const { container } = render(
      <ProjectProgress progress={{ total_tasks: 4, done_tasks: 1, percent: 25 }} />,
    );

    expect(screen.getByText(/1 \/ 4 tasks done · 25%/)).toBeInTheDocument();
    const fill = container.querySelector('[class*="fill"]') as HTMLElement;
    expect(fill).toHaveStyle({ width: "25%" });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
  });

  it("lists the board columns when given", () => {
    render(
      <ProjectProgress
        progress={{ total_tasks: 3, done_tasks: 3, percent: 100 }}
        columns={[
          { name: "To Do", position: 0, task_count: 0 },
          { name: "Doing", position: 1, task_count: 0 },
          { name: "Done", position: 2, task_count: 3 },
        ]}
      />,
    );

    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("Doing")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
