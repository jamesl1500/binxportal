/**
 * actions.ts - Feedback
 *
 * Server actions for product feedback, shared by the staff app and the
 * client portal (the portal imports them from here, the same way it uses
 * `portalLogoutAction` from `(app)/actions.ts`): sending feedback from the
 * dialog, answering or dismissing the check-in pulse, and the Binx team's
 * triage edits on `/admin/feedback/[id]`.
 *
 * @module apps/binx-web/src/app/(app)/feedback/actions.ts
 * @author Binx Portal
 */
"use server";

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import {
  type FeedbackAdminItem,
  type FeedbackInput,
  type FeedbackItem,
  type FeedbackTriageInput,
  type PulseAnswerInput,
  answerPulse,
  dismissPulse,
  submitFeedback,
  updateFeedback,
} from "@/lib/feedback";

export interface FeedbackResult {
  error?: string;
  feedback?: FeedbackItem;
}

function fail(error: unknown, fallback: string): { error: string } {
  return { error: error instanceof AuthApiError ? error.message : fallback };
}

export async function submitFeedbackAction(
  input: FeedbackInput,
): Promise<FeedbackResult> {
  if (!input.message.trim()) {
    return { error: "Tell us a little about it" };
  }
  try {
    const feedback = await submitFeedback(input);
    // So an open "Your feedback" page shows the new entry straight away.
    refresh();
    return { feedback };
  } catch (error) {
    return fail(error, "Unable to send your feedback. Please try again.");
  }
}

export async function answerPulseAction(
  pulseKey: string,
  input: PulseAnswerInput,
): Promise<FeedbackResult> {
  try {
    return { feedback: await answerPulse(pulseKey, input) };
  } catch (error) {
    return fail(error, "Unable to save your answer. Please try again.");
  }
}

export async function dismissPulseAction(
  pulseKey: string,
): Promise<{ error?: string }> {
  try {
    await dismissPulse(pulseKey);
    return {};
  } catch (error) {
    return fail(error, "Unable to dismiss the check-in");
  }
}

export async function updateFeedbackAction(
  id: string,
  input: FeedbackTriageInput,
): Promise<{ error?: string; feedback?: FeedbackAdminItem }> {
  try {
    const feedback = await updateFeedback(id, input);
    refresh();
    return { feedback };
  } catch (error) {
    return fail(error, "Unable to update this feedback");
  }
}
