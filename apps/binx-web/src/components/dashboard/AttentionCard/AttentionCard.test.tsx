import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AttentionCard from "./AttentionCard";

const invoice = (id: string) => ({
  id,
  number: `INV-${id}`,
  amount_due_cents: 12_345,
  currency: "USD",
  client_name: "Acme",
}) as never;

const project = (id: string) => ({ id, name: `Project ${id}`, client_name: "Acme" }) as never;

describe("AttentionCard", () => {
  it("shows the reassuring empty state when nothing needs attention", () => {
    render(<AttentionCard overdueInvoices={[]} overdueTaskCount={0} onHoldProjects={[]} />);
    expect(screen.getByText(/nothing needs attention/i)).toBeInTheDocument();
  });

  it("lists overdue invoices, overdue tasks and on-hold projects with links", () => {
    render(
      <AttentionCard
        overdueInvoices={[invoice("1"), invoice("2")]}
        overdueTaskCount={1}
        onHoldProjects={[project("9")]}
      />,
    );
    expect(screen.getByRole("link", { name: /INV-1/ })).toHaveAttribute("href", "/invoices/1");
    expect(screen.getByRole("link", { name: /your task is overdue/i })).toHaveAttribute("href", "/dashboard/my-work");
    expect(screen.getByRole("link", { name: /Project 9 is on hold/ })).toHaveAttribute("href", "/projects/9");
  });

  it("caps the invoice rows at four", () => {
    render(
      <AttentionCard
        overdueInvoices={["1", "2", "3", "4", "5"].map(invoice)}
        overdueTaskCount={0}
        onHoldProjects={[]}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("pluralises the overdue-task row", () => {
    render(<AttentionCard overdueInvoices={[]} overdueTaskCount={3} onHoldProjects={[]} />);
    expect(screen.getByText(/3 of your tasks are overdue/i)).toBeInTheDocument();
  });
});
