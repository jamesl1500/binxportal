/**
 * dashboard.ts
 *
 * Server-only helper for the team dashboard's aggregation endpoints. Today
 * just "my work" — the signed-in member's assigned, not-done tasks across
 * every project in the agency (`GET /agencies/{id}/my-work`).
 *
 * @module apps/binx-web/src/lib/dashboard.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";

export interface MyTask {
  id: string;
  title: string;
  due_date: string | null;
  project_id: string;
  project_name: string;
  client_name: string;
  list_name: string;
  overdue: boolean;
}

export interface MyWork {
  tasks: MyTask[];
  total_open: number;
  overdue_count: number;
  due_soon_count: number;
}

export async function getMyWork(agencyId: string): Promise<MyWork> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  try {
    const { data } = await api.get<MyWork>(`/agencies/${agencyId}/my-work`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to load your work"),
        error.response.status,
      );
    }
    throw error;
  }
}
