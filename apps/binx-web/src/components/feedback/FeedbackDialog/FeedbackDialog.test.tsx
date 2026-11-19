import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/projects/p1" }));
vi.mock("@/app/(app)/feedback/actions", () => ({
  submitFeedbackAction: vi.fn(),
  answerPulseAction: vi.fn(),
  dismissPulseAction: vi.fn(),
}));

import { submitFeedbackAction } from "@/app/(app)/feedback/actions";
import FeedbackLauncher from "@/components/feedback/FeedbackLauncher/FeedbackLauncher";
import FeedbackProvider from "@/components/feedback/FeedbackProvider/FeedbackProvider";
import SendFeedbackButton from "@/components/feedback/SendFeedbackButton/SendFeedbackButton";

const mockedSubmit = vi.mocked(submitFeedbackAction);

function renderApp() {
  return render(
    <FeedbackProvider surface="app" agencyId="a1">
      <FeedbackLauncher />
      <SendFeedbackButton kind="bug" label="Report a bug" />
    </FeedbackProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSubmit.mockResolvedValue({ feedback: { id: "f1" } as never });
});

describe("FeedbackDialog", () => {
  it("sends the kind, message, rating, consent and page context", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Share feedback" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByText("Something's broken"));
    await user.type(within(dialog).getByRole("textbox"), "  Export hangs  ");
    await user.click(within(dialog).getByRole("button", { name: /2 of 5/i }));
    await user.click(within(dialog).getByRole("checkbox", { name: /okay to email me/i }));
    await user.click(within(dialog).getByRole("button", { name: "Send feedback" }));

    expect(mockedSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "app",
        agencyId: "a1",
        kind: "bug",
        message: "Export hangs",
        rating: 2,
        allowContact: false,
        pagePath: "/projects/p1",
      }),
    );
    expect(await within(dialog).findByText(/we've got it/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Your feedback" })).toHaveAttribute(
      "href",
      "/feedback",
    );
  });

  it("tells the user what page details are attached", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Share feedback" }));
    expect(await screen.findByText("/projects/p1")).toBeInTheDocument();
  });

  it("won't send an empty message", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Share feedback" }));
    const dialog = await screen.findByRole("dialog");
    // `required` blocks a real submit; fire it to check our own guard too.
    within(dialog).getByRole("textbox").removeAttribute("required");
    await user.click(within(dialog).getByRole("button", { name: "Send feedback" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/tell us a little/i);
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it("shows the API's error and keeps the draft", async () => {
    mockedSubmit.mockResolvedValueOnce({ error: "Slow down a little" });
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Share feedback" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "Hello");
    await user.click(within(dialog).getByRole("button", { name: "Send feedback" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Slow down a little");
    expect(within(dialog).getByRole("textbox")).toHaveValue("Hello");
  });

  it("opens on the kind the opener asked for, with a fresh form", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Share feedback" }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "draft");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Report a bug" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: /something's broken/i })).toBeChecked();
    expect(within(dialog).getByRole("textbox")).toHaveValue("");
  });

  it("in the portal, says it goes to Binx rather than the agency", async () => {
    const user = userEvent.setup();
    render(
      <FeedbackProvider surface="portal" agencyName="Pixel Forge">
        <SendFeedbackButton />
      </FeedbackProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Share feedback" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/not to Pixel Forge/);
    expect(within(dialog).getByRole("link", { name: /message pixel forge/i })).toHaveAttribute(
      "href",
      "/portal/messages",
    );
  });

  it("renders nothing outside a provider", () => {
    const { container } = render(
      <>
        <FeedbackLauncher />
        <SendFeedbackButton />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
