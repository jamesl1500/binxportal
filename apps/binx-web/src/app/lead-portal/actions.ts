/**
 * actions.ts - Lead portal (public)
 *
 * The lead asking a question from their portal. No session: the token alone
 * scopes it, same as the page.
 *
 * @module apps/binx-web/src/app/lead-portal/actions.ts
 * @author Binx Portal
 */
"use server";

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { askInLeadPortal } from "@/lib/lead-portal";

export async function askInLeadPortalAction(
  token: string,
  body: string,
  authorName: string | null,
): Promise<{ error?: string }> {
  if (body.trim() === "") return { error: "Write your question first" };
  try {
    await askInLeadPortal(token, body.trim(), authorName?.trim() || null);
    refresh();
    return {};
  } catch (error) {
    if (error instanceof AuthApiError) return { error: error.message };
    return { error: "Unable to send your question" };
  }
}
