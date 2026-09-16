/**
 * plan-intent.ts
 *
 * The localStorage key carrying which plan a visitor clicked on the
 * marketing pricing page, from `/auth/signup?plan=pro` through signup and
 * email verification to `/onboarding/three`, where PlanSelector reads and
 * clears it to highlight the matching card. Same-browser, best-effort only:
 * Server Components can't set cookies outside a Server Action/Route
 * Handler, and this only needs to survive until the user reaches onboarding
 * in the same browser.
 *
 * @module apps/binx-web/src/lib/plan-intent.ts
 * @author Binx.io
 */
export const PLAN_INTENT_STORAGE_KEY = "binx_plan_intent";
