/**
 * Auth Default Page
 * 
 * This page will redirect users to the dashboard if they are authenticated. 
 * If not, it will redirect them to the login page.
 * 
 * @module apps/binx-web/src/app/(auth)/auth/page.tsx
 * @author Binx.io
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

const AuthDefaultPage = async () => {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
};

export default AuthDefaultPage;