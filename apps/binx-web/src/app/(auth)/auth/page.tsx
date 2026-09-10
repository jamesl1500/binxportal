/**
 * Auth Default Page
 * 
 * This page will redirect users to the dashboard if they are authenticated. 
 * If not, it will redirect them to the login page.
 * 
 * @module apps/binx-web/src/app/(auth)/auth/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

const AuthDefaultPage = async () => {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/auth/login");
  }
};

export default AuthDefaultPage;