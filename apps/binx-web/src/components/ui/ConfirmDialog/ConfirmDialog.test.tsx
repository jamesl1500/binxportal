import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useConfirmDialog, type AlertOptions, type ConfirmOptions } from "./ConfirmDialog";

const Harness = ({
  options,
  alertOptions,
  onResult,
}: {
  options?: ConfirmOptions;
  alertOptions?: AlertOptions;
  onResult: (result: boolean | "acknowledged") => void;
}) => {
  const { confirm, alert, dialog } = useConfirmDialog();

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (alertOptions) {
            await alert(alertOptions);
            onResult("acknowledged");
          } else {
            onResult(await confirm(options!));
          }
        }}
      >
        Open
      </button>
      {dialog}
    </>
  );
};

describe("useConfirmDialog", () => {
  it("renders nothing until asked", () => {
    render(<Harness options={{ title: "Delete it?" }} onResult={vi.fn()} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("resolves true when confirmed", async () => {
    const onResult = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        options={{ title: "Delete brief.pdf?", description: "This can't be undone.", confirmLabel: "Delete file" }}
        onResult={onResult}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Delete brief.pdf?" });
    expect(dialog).toHaveTextContent("This can't be undone.");

    await user.click(screen.getByRole("button", { name: "Delete file" }));

    expect(onResult).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("resolves false when cancelled", async () => {
    const onResult = vi.fn();
    const user = userEvent.setup();
    render(<Harness options={{ title: "Delete it?" }} onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(onResult).toHaveBeenCalledWith(false);
  });

  it("resolves false on Escape", async () => {
    const onResult = vi.fn();
    const user = userEvent.setup();
    render(<Harness options={{ title: "Delete it?" }} onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("marks destructive confirms with the danger tone", async () => {
    const user = userEvent.setup();
    render(<Harness options={{ title: "Delete it?", tone: "danger" }} onResult={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(await screen.findByRole("alertdialog")).toHaveAttribute("data-tone", "danger");
  });

  it("shows an alert with a single acknowledge button", async () => {
    const onResult = vi.fn();
    const user = userEvent.setup();
    render(<Harness alertOptions={{ title: "Upload too large" }} onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("alertdialog", { name: "Upload too large" });

    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith("acknowledged"));
  });
});
