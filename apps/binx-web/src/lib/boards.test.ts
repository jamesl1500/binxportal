import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { AuthApiError, getAccessToken } from "@/lib/auth";
import {
  addBoardComment,
  createBoardItem,
  deleteBoardComment,
  deleteBoardItem,
  getBoard,
  getBoardComments,
  toggleBoardReaction,
  updateBoardItem,
  uploadBoardImage,
} from "@/lib/boards";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

function axiosError(status: number, detail: string) {
  return Object.assign(new Error("x"), { isAxiosError: true, response: { status, data: { detail } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("token");
});

describe("getBoard", () => {
  it("GETs the canvas endpoint with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { board_id: "b1", items: [] } });
    await getBoard("a1", "p1");
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a1/projects/p1/canvas", {
      headers: { Authorization: "Bearer token" },
    });
  });

  it("throws AuthApiError(401) with no session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(getBoard("a1", "p1")).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });
});

describe("createBoardItem", () => {
  it("POSTs the item to the items sub-resource", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "i1" } });
    await createBoardItem("a1", "p1", { type: "note", x: 10, y: 20, content: { text: "hi" } });
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/projects/p1/canvas/items",
      { type: "note", x: 10, y: 20, content: { text: "hi" } },
      { headers: { Authorization: "Bearer token" } },
    );
  });
});

describe("updateBoardItem", () => {
  it("PATCHes just the changed fields", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: "i1", x: 5 } });
    await updateBoardItem("a1", "p1", "i1", { x: 5, y: 6 });
    expect(mockedApi.patch).toHaveBeenCalledWith(
      "/agencies/a1/projects/p1/canvas/items/i1",
      { x: 5, y: 6 },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps a 409 (canvas full) to an AuthApiError", async () => {
    mockedApi.patch.mockRejectedValueOnce(axiosError(409, "This canvas is full (500 cards)."));
    await expect(updateBoardItem("a1", "p1", "i1", { x: 1 })).rejects.toEqual(
      new AuthApiError("This canvas is full (500 cards).", 409),
    );
  });
});

describe("deleteBoardItem", () => {
  it("DELETEs the item", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await deleteBoardItem("a1", "p1", "i1");
    expect(mockedApi.delete).toHaveBeenCalledWith("/agencies/a1/projects/p1/canvas/items/i1", {
      headers: { Authorization: "Bearer token" },
    });
  });

  it("rethrows a non-axios error unchanged", async () => {
    const boom = new Error("network gone");
    mockedApi.delete.mockRejectedValueOnce(boom);
    await expect(deleteBoardItem("a1", "p1", "i1")).rejects.toBe(boom);
  });
});

describe("uploadBoardImage", () => {
  it("POSTs multipart FormData with placement params and no JSON Content-Type", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "img1" } });
    const file = new File(["x"], "shot.png", { type: "image/png" });
    await uploadBoardImage("a1", "p1", file, { x: 1, y: 2, width: 100 });

    const [url, form, config] = mockedApi.post.mock.calls[0];
    expect(url).toBe("/agencies/a1/projects/p1/canvas/images");
    expect((form as FormData).get("file")).toBe(file);
    expect((config as { params: unknown }).params).toEqual({ x: 1, y: 2, width: 100 });
    expect((config as { headers: Record<string, unknown> }).headers["Content-Type"]).toBeUndefined();
  });

  it("maps an oversize image to AuthApiError(413)", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(413, "Image too large"));
    await expect(
      uploadBoardImage("a1", "p1", new File(["x"], "a.png"), { x: 0, y: 0 }),
    ).rejects.toMatchObject({ name: "AuthApiError", status: 413 });
  });
});

describe("toggleBoardReaction", () => {
  it("POSTs the reaction kind", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { reactions: { "👍": 1 }, my_reactions: ["👍"] } });
    const res = await toggleBoardReaction("a1", "p1", "i1", "👍");
    expect(res.my_reactions).toEqual(["👍"]);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/projects/p1/canvas/items/i1/reactions",
      { kind: "👍" },
      { headers: { Authorization: "Bearer token" } },
    );
  });
});

describe("board comments", () => {
  it("getBoardComments lists a card's comments", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [{ id: "c1" }] });
    expect(await getBoardComments("a1", "p1", "i1")).toEqual([{ id: "c1" }]);
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a1/projects/p1/canvas/items/i1/comments", {
      headers: { Authorization: "Bearer token" },
    });
  });

  it("addBoardComment POSTs the body", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "c2" } });
    await addBoardComment("a1", "p1", "i1", "looks great");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/projects/p1/canvas/items/i1/comments",
      { body: "looks great" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("deleteBoardComment DELETEs one comment", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await deleteBoardComment("a1", "p1", "i1", "c2");
    expect(mockedApi.delete).toHaveBeenCalledWith(
      "/agencies/a1/projects/p1/canvas/items/i1/comments/c2",
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it.each([
    ["getBoardComments", () => getBoardComments("a1", "p1", "i1")],
    ["addBoardComment", () => addBoardComment("a1", "p1", "i1", "x")],
    ["deleteBoardComment", () => deleteBoardComment("a1", "p1", "i1", "c1")],
    ["toggleBoardReaction", () => toggleBoardReaction("a1", "p1", "i1", "x")],
    ["createBoardItem", () => createBoardItem("a1", "p1", { type: "note", x: 0, y: 0 })],
  ])("%s throws AuthApiError(401) with no session", async (_n, call) => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });
});
