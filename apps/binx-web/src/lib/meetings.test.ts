import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import * as meetings from "@/lib/meetings";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "agency-1";
const M = "meeting-1";
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

const meetingCreateInput: meetings.MeetingCreateInput = {
  client_id: "client-1",
  project_id: null,
  starts_at: "2026-06-01T15:00:00Z",
  title: "Kickoff",
  notes: null,
  location: null,
};

describe("meetings.ts", () => {
  it("getMeetingSettings GETs the settings row", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { timezone: "UTC" } });
    const res = await meetings.getMeetingSettings(A);
    expect(res).toEqual({ timezone: "UTC" });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/meeting-settings`, AUTH);
  });

  it("updateMeetingSettings PATCHes the settings", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: {} });
    const input: meetings.MeetingSettingsUpdate = {
      timezone: "America/New_York",
      slot_minutes: 30,
      booking_notice_hours: 24,
      booking_window_days: 30,
      self_booking_enabled: true,
    };
    await meetings.updateMeetingSettings(A, input);
    expect(mockedApi.patch).toHaveBeenCalledWith(`/agencies/${A}/meeting-settings`, input, AUTH);
  });

  it("getAvailabilityRules GETs the rule list", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await meetings.getAvailabilityRules(A);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/availability-rules`, AUTH);
  });

  it("putAvailabilityRules PUTs the full rule list", async () => {
    mockedApi.put.mockResolvedValueOnce({ data: [] });
    const rules: meetings.AvailabilityRuleInput[] = [{ weekday: 0, start_time: "09:00", end_time: "17:00" }];
    await meetings.putAvailabilityRules(A, rules);
    expect(mockedApi.put).toHaveBeenCalledWith(`/agencies/${A}/availability-rules`, rules, AUTH);
  });

  it("getAvailableSlots passes the date range as query params", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await meetings.getAvailableSlots(A, "2026-06-01", "2026-06-30");
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/meetings/slots`, {
      ...AUTH,
      params: { from_date: "2026-06-01", to_date: "2026-06-30" },
    });
  });

  it("getMeetings passes the filter through as query params", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await meetings.getMeetings(A, { clientId: "c1", projectId: "p1", status: "scheduled" });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/meetings`, {
      ...AUTH,
      params: { client_id: "c1", project_id: "p1", status: "scheduled", from_date: undefined, to_date: undefined },
    });
  });

  it("createMeeting POSTs the input as-is", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: M } });
    await meetings.createMeeting(A, meetingCreateInput);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/meetings`, meetingCreateInput, AUTH);
  });

  it("updateMeeting PATCHes the meeting", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: M } });
    const input: meetings.MeetingUpdateInput = {
      project_id: null,
      starts_at: "2026-06-01T15:00:00Z",
      title: "Kickoff call",
      notes: null,
      location: null,
    };
    await meetings.updateMeeting(A, M, input);
    expect(mockedApi.patch).toHaveBeenCalledWith(`/agencies/${A}/meetings/${M}`, input, AUTH);
  });

  it("cancelMeeting POSTs a null body", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: M } });
    await meetings.cancelMeeting(A, M);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/meetings/${M}/cancel`, null, AUTH);
  });

  describe("groupSlotsByLocalDay", () => {
    it("buckets slots under the same key when they share a local calendar day", () => {
      const groups = meetings.groupSlotsByLocalDay([
        { starts_at: "2026-06-01T13:00:00Z", ends_at: "2026-06-01T13:30:00Z" },
        { starts_at: "2026-06-01T15:00:00Z", ends_at: "2026-06-01T15:30:00Z" },
      ]);
      expect(groups.size).toBe(1);
      expect([...groups.values()][0]).toHaveLength(2);
    });

    it("splits slots on different local calendar days into separate keys", () => {
      const groups = meetings.groupSlotsByLocalDay([
        { starts_at: "2026-06-01T15:00:00Z", ends_at: "2026-06-01T15:30:00Z" },
        { starts_at: "2026-07-15T15:00:00Z", ends_at: "2026-07-15T15:30:00Z" },
      ]);
      expect(groups.size).toBe(2);
    });

    it("returns an empty map for no slots", () => {
      expect(meetings.groupSlotsByLocalDay([]).size).toBe(0);
    });
  });

  describe("error handling (shared)", () => {
    it("wraps upstream errors as AuthApiError", async () => {
      mockedApi.get.mockRejectedValueOnce(axiosError(403, "Nope"));
      await expect(meetings.getMeetings(A)).rejects.toMatchObject({ name: "AuthApiError", status: 403, message: "Nope" });
    });

    it.each([
      ["getMeetingSettings", () => meetings.getMeetingSettings(A)],
      [
        "updateMeetingSettings",
        () =>
          meetings.updateMeetingSettings(A, {
            timezone: "UTC",
            slot_minutes: 30,
            booking_notice_hours: 24,
            booking_window_days: 30,
            self_booking_enabled: true,
          }),
      ],
      ["getAvailabilityRules", () => meetings.getAvailabilityRules(A)],
      ["putAvailabilityRules", () => meetings.putAvailabilityRules(A, [])],
      ["getAvailableSlots", () => meetings.getAvailableSlots(A, "2026-01-01")],
      ["getMeetings", () => meetings.getMeetings(A)],
      ["createMeeting", () => meetings.createMeeting(A, meetingCreateInput)],
      [
        "updateMeeting",
        () =>
          meetings.updateMeeting(A, M, {
            project_id: null,
            starts_at: "2026-06-01T15:00:00Z",
            title: "Kickoff",
            notes: null,
            location: null,
          }),
      ],
      ["cancelMeeting", () => meetings.cancelMeeting(A, M)],
    ])("%s throws AuthApiError(401) when unauthenticated", async (_name, call) => {
      mockedGetAccessToken.mockResolvedValueOnce(undefined);
      await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    });
  });
});
