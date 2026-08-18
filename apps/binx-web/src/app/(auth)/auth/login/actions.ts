"use server";

import { redirect } from "next/navigation";

import { login } from "@/lib/auth";

export interface LoginActionResult {
  error?: string;
}

export async function loginAction(email: string, password: string): Promise<LoginActionResult> {
  try {
    await login(email, password);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to sign in" };
  }

  redirect("/dashboard");
}
