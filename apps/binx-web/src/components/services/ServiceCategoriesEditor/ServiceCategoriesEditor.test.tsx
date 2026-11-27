import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/settings/services/actions", () => ({
  createCategoryAction: vi.fn(),
  renameCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { toast } from "sonner";

import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from "@/app/(app)/settings/services/actions";

import ServiceCategoriesEditor from "./ServiceCategoriesEditor";

const categories = [{ id: "c1", name: "Branding", position: 0, service_count: 2 }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServiceCategoriesEditor", () => {
  it("adds a category and clears the box", async () => {
    vi.mocked(createCategoryAction).mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ServiceCategoriesEditor agencyId="a1" categories={categories} />);
    await user.type(screen.getByLabelText("New category"), "Web");
    await user.click(screen.getByRole("button", { name: "Add category" }));
    expect(createCategoryAction).toHaveBeenCalledWith("a1", "Web");
    expect(screen.getByLabelText("New category")).toHaveValue("");
  });

  it("renames in place on Enter, and skips an unchanged name", async () => {
    vi.mocked(renameCategoryAction).mockResolvedValueOnce({ error: "There's already a category called “Web”" });
    const user = userEvent.setup();
    render(<ServiceCategoriesEditor agencyId="a1" categories={categories} />);
    const box = screen.getByLabelText("Rename Branding");
    await user.click(box);
    await user.tab();
    expect(renameCategoryAction).not.toHaveBeenCalled();
    await user.clear(box);
    await user.type(box, "Web{Enter}");
    expect(renameCategoryAction).toHaveBeenCalledWith("a1", "c1", "Web");
    expect(toast.error).toHaveBeenCalledWith("There's already a category called “Web”");
  });

  it("deletes after confirming, saying what happens to its services", async () => {
    vi.mocked(deleteCategoryAction).mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ServiceCategoriesEditor agencyId="a1" categories={categories} />);
    await user.click(screen.getByRole("button", { name: "Delete Branding" }));
    expect(await screen.findByText(/Its 2 services stay in the catalog/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete category" }));
    expect(deleteCategoryAction).toHaveBeenCalledWith("a1", "c1");
  });
});
