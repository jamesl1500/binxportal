import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AiMarkdown from "./AiMarkdown";

describe("AiMarkdown", () => {
  it("renders bold text as a real <strong>, not literal asterisks", () => {
    render(<AiMarkdown content="You have **2 overdue invoices** this week." />);
    const strong = screen.getByText("2 overdue invoices");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("renders a markdown bullet list as real list items", () => {
    render(<AiMarkdown content={"Do next:\n\n- Follow up with Acme\n- Issue invoice INV-0001"} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Follow up with Acme", "Issue invoice INV-0001"]);
  });

  it("renders GFM features like a link", () => {
    render(<AiMarkdown content="See [the invoice](https://example.com/inv) for details." />);
    expect(screen.getByRole("link", { name: "the invoice" })).toHaveAttribute("href", "https://example.com/inv");
  });
});
