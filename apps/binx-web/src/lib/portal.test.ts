import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

vi.mock("@/lib/agencies", () => ({ getMyAgencies: vi.fn() }));

import { api } from "@/lib/api";
import { getMyAgencies } from "@/lib/agencies";
import { getAccessToken } from "@/lib/auth";
import * as portal from "@/lib/portal";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);
const mockedGetMyAgencies = vi.mocked(getMyAgencies);

const PJ = "proj-1";
const IT = "item-1";
const AUTH = { headers: { Authorization: "Bearer tok" } };

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`status ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("tok");
});

describe("getPortalContext", () => {
  it("returns the context on success", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { client: { name: "Acme" } } });
    expect(await portal.getPortalContext()).toEqual({ client: { name: "Acme" } });
    expect(mockedApi.get).toHaveBeenCalledWith("/portal/context", AUTH);
  });

  it("returns null when there is no session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    expect(await portal.getPortalContext()).toBeNull();
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it.each([401, 403])("returns null on a %d from the API", async (status) => {
    mockedApi.get.mockRejectedValueOnce(axiosError(status, "no"));
    expect(await portal.getPortalContext()).toBeNull();
  });

  it("rethrows other errors as AuthApiError", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(500, "boom"));
    await expect(portal.getPortalContext()).rejects.toMatchObject({ name: "AuthApiError", status: 500 });
  });
});

describe("resolveHome", () => {
  it("sends a user with an agency to the dashboard", async () => {
    mockedGetMyAgencies.mockResolvedValueOnce([{ id: "a1" }] as never);
    expect(await portal.resolveHome()).toBe("/dashboard");
  });

  it("sends a client contact to the portal", async () => {
    mockedGetMyAgencies.mockResolvedValueOnce([]);
    mockedApi.get.mockResolvedValueOnce({ data: { client: {} } });
    expect(await portal.resolveHome()).toBe("/portal");
  });

  it("sends everyone else to onboarding", async () => {
    mockedGetMyAgencies.mockResolvedValueOnce([]);
    mockedApi.get.mockRejectedValueOnce(axiosError(403, "no"));
    expect(await portal.resolveHome()).toBe("/onboarding/one");
  });

  it("treats a getMyAgencies failure as no agencies", async () => {
    mockedGetMyAgencies.mockRejectedValueOnce(new Error("down"));
    mockedApi.get.mockRejectedValueOnce(axiosError(401, "no"));
    expect(await portal.resolveHome()).toBe("/onboarding/one");
  });
});

interface Case {
  name: string;
  call: () => Promise<unknown>;
  method: "get" | "post" | "patch" | "delete";
  url: string;
  body?: unknown;
  void?: boolean;
}

const cases: Case[] = [
  { name: "getPortalProjects", call: () => portal.getPortalProjects(), method: "get", url: "/portal/projects" },
  { name: "getPortalProject", call: () => portal.getPortalProject(PJ), method: "get", url: `/portal/projects/${PJ}` },
  {
    name: "getPortalTaskBoard",
    call: () => portal.getPortalTaskBoard(PJ),
    method: "get",
    url: `/portal/projects/${PJ}/board`,
  },
  { name: "getPortalInvoices", call: () => portal.getPortalInvoices(), method: "get", url: "/portal/invoices" },
  { name: "getPortalInvoice", call: () => portal.getPortalInvoice("i1"), method: "get", url: "/portal/invoices/i1" },
  {
    name: "startPortalInvoiceCheckout",
    call: () => portal.startPortalInvoiceCheckout("i1"),
    method: "post",
    url: "/portal/invoices/i1/pay",
    body: undefined,
  },
  {
    name: "getPortalConversations",
    call: () => portal.getPortalConversations(),
    method: "get",
    url: "/portal/conversations",
  },
  {
    name: "getPortalConversation",
    call: () => portal.getPortalConversation("c1"),
    method: "get",
    url: "/portal/conversations/c1",
  },
  {
    name: "markPortalConversationRead",
    call: () => portal.markPortalConversationRead("c1"),
    method: "post",
    url: "/portal/conversations/c1/read",
    body: undefined,
    void: true,
  },
  { name: "getPortalBoard", call: () => portal.getPortalBoard(PJ), method: "get", url: `/portal/projects/${PJ}/canvas` },
  {
    name: "createPortalBoardItem",
    call: () => portal.createPortalBoardItem(PJ, { type: "note", x: 0, y: 0, content: { text: "hi" } } as never),
    method: "post",
    url: `/portal/projects/${PJ}/canvas/items`,
    body: { type: "note" },
  },
  {
    name: "updatePortalBoardItem",
    call: () => portal.updatePortalBoardItem(PJ, IT, { x: 5 } as never),
    method: "patch",
    url: `/portal/projects/${PJ}/canvas/items/${IT}`,
    body: { x: 5 },
  },
  {
    name: "deletePortalBoardItem",
    call: () => portal.deletePortalBoardItem(PJ, IT),
    method: "delete",
    url: `/portal/projects/${PJ}/canvas/items/${IT}`,
    void: true,
  },
  {
    name: "togglePortalBoardReaction",
    call: () => portal.togglePortalBoardReaction(PJ, IT, "thumbsup"),
    method: "post",
    url: `/portal/projects/${PJ}/canvas/items/${IT}/reactions`,
    body: { kind: "thumbsup" },
  },
  {
    name: "getPortalBoardComments",
    call: () => portal.getPortalBoardComments(PJ, IT),
    method: "get",
    url: `/portal/projects/${PJ}/canvas/items/${IT}/comments`,
  },
  {
    name: "addPortalBoardComment",
    call: () => portal.addPortalBoardComment(PJ, IT, "nice"),
    method: "post",
    url: `/portal/projects/${PJ}/canvas/items/${IT}/comments`,
    body: { body: "nice" },
  },
  {
    name: "deletePortalBoardComment",
    call: () => portal.deletePortalBoardComment(PJ, IT, "cm1"),
    method: "delete",
    url: `/portal/projects/${PJ}/canvas/items/${IT}/comments/cm1`,
    void: true,
  },
  {
    name: "acceptPortalInvitation",
    call: () => portal.acceptPortalInvitation("tkn"),
    method: "post",
    url: "/portal/invitations/accept",
    body: { token: "tkn" },
  },
];

describe("portal.ts endpoint wrappers", () => {
  for (const c of cases) {
    describe(c.name, () => {
      it("calls the right endpoint", async () => {
        mockedApi[c.method].mockResolvedValueOnce({ data: c.void ? undefined : { ok: true } });
        await c.call();
        expect(mockedApi[c.method].mock.calls[0][0]).toBe(c.url);
      });

      it("rethrows an upstream error as AuthApiError", async () => {
        mockedApi[c.method].mockRejectedValueOnce(axiosError(500, "boom"));
        await expect(c.call()).rejects.toMatchObject({ name: "AuthApiError", status: 500 });
      });

      it("throws AuthApiError(401) when unauthenticated", async () => {
        mockedGetAccessToken.mockResolvedValueOnce(undefined);
        await expect(c.call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
      });
    });
  }
});

describe("portal.ts special cases", () => {
  it("getPortalMessages defaults limit to 50", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await portal.getPortalMessages("c1");
    expect(mockedApi.get).toHaveBeenCalledWith("/portal/conversations/c1/messages", {
      ...AUTH,
      params: { limit: 50, before: undefined },
    });
  });

  it("sendPortalMessage posts FormData with the body and no JSON Content-Type", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "m1" } });
    await portal.sendPortalMessage("c1", "hello team");
    const [url, form, config] = mockedApi.post.mock.calls[0];
    expect(url).toBe("/portal/conversations/c1/messages");
    expect((form as FormData).get("body")).toBe("hello team");
    expect((config as { headers: Record<string, unknown> }).headers["Content-Type"]).toBeUndefined();
  });

  it("uploadPortalBoardImage sends the file and placement params", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "img1" } });
    const file = new File(["x"], "a.png", { type: "image/png" });
    await portal.uploadPortalBoardImage(PJ, file, { x: 10, y: 20 });
    const [url, form, config] = mockedApi.post.mock.calls[0];
    expect(url).toBe(`/portal/projects/${PJ}/canvas/images`);
    expect((form as FormData).get("file")).toBe(file);
    expect((config as { params: unknown }).params).toEqual({ x: 10, y: 20 });
  });

  it("previewPortalInvitation needs no auth header", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { agency_name: "Acme" } });
    await portal.previewPortalInvitation("tok");
    expect(mockedApi.get).toHaveBeenCalledWith("/portal/invitations/preview", { params: { token: "tok" } });
  });

  it("previewPortalInvitation rethrows an expired-link error", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(400, "expired"));
    await expect(portal.previewPortalInvitation("tok")).rejects.toMatchObject({ name: "AuthApiError", status: 400 });
  });

  it("startPortalInvoiceCheckout returns the checkout URL", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { checkout_url: "https://checkout.stripe.com/abc" } });
    expect(await portal.startPortalInvoiceCheckout("i1")).toBe("https://checkout.stripe.com/abc");
  });

  it("startPortalInvoiceCheckout surfaces a 409 (Stripe not connected yet)", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(409, "Online payment isn't set up for this agency yet"));
    await expect(portal.startPortalInvoiceCheckout("i1")).rejects.toMatchObject({
      name: "AuthApiError",
      status: 409,
    });
  });
});
