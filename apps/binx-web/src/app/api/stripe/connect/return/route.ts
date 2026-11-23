/**
 * route.ts - Stripe Connect return
 *
 * Where Stripe's hosted onboarding sends the browser back to. The URL names
 * the agency the account belongs to. Since "current agency" is a cookie, this
 * re-selects that agency first (after checking the person belongs to it), so
 * someone who switched agencies while on Stripe still lands on the right one.
 * A Route Handler because a page render can't set cookies.
 *
 * @module apps/binx-web/src/app/api/stripe/connect/return/route.ts
 * @author Binx Portal
 */
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { getMyAgencies, setCurrentAgencyId } from "@/lib/agencies";
import type { StripeConnectReturnTo } from "@/lib/invoicing";

// A fixed list, so this can never redirect anywhere else.
const DESTINATIONS: Record<StripeConnectReturnTo, string> = {
  settings: "/settings/invoicing",
  onboarding: "/onboarding/five",
  new_agency: "/agencies/new/payments",
};

function destination(to: string | null): string {
  return to !== null && Object.hasOwn(DESTINATIONS, to)
    ? DESTINATIONS[to as StripeConnectReturnTo]
    : DESTINATIONS.settings;
}

export async function GET(request: NextRequest): Promise<never> {
  const { searchParams } = request.nextUrl;
  const agencyId = searchParams.get("agency");
  const state = searchParams.get("stripe") === "return" ? "return" : "refresh";

  try {
    const agencies = await getMyAgencies();
    if (agencies.some((agency) => agency.id === agencyId)) {
      await setCurrentAgencyId(agencyId as string);
    }
  } catch {
    // Signed out or the API is unreachable: the destination page handles both.
  }

  redirect(`${destination(searchParams.get("to"))}?stripe=${state}`);
}
