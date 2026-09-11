/**
 * billing.ts
 *
 * Server-only helpers for binx-api's `/agencies/{agencyId}/plan` endpoints —
 * the agency's subscription plan, its limits, and live usage counts. Distinct
 * from `lib/invoicing.ts`'s billing *settings* (the invoice "from" block).
 * Same shape as `lib/ai.ts`: attach the access token, map errors to
 * `AuthApiError`.
 *
 * @module apps/binx-web/src/lib/billing.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type { PlanLimits } from "@/lib/billing-client";

export type { PlanLimits };

export type PlanUsage = Schemas["PlanUsageRead"];
export type Subscription = Schemas["SubscriptionRead"];

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function rethrow(error: unknown, fallback: string): never {
  if (axios.isAxiosError(error) && error.response) {
    throw new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  throw error;
}

export async function getSubscription(agencyId: string): Promise<Subscription> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Subscription>(`/agencies/${agencyId}/plan`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load the plan");
  }
}

export async function getPlanCatalog(agencyId: string): Promise<PlanLimits[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<PlanLimits[]>(`/agencies/${agencyId}/plan/catalog`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load the plan catalog");
  }
}

export async function changePlan(agencyId: string, plan: string): Promise<Subscription> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<Subscription>(`/agencies/${agencyId}/plan`, { plan }, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to change the plan");
  }
}
