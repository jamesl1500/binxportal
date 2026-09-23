/**
 * NewAgencyForm.tsx
 *
 * Client wrapper around the shared `CreateAgencyForm` for the dedicated
 * `/agencies/new` page: createAgencyAction already makes the new agency
 * "current" server-side, so success just navigates to the dashboard under
 * it; cancel returns to wherever the user came from. Replaces the
 * OrgSwitcher dropdown's create-agency dialog.
 *
 * @module apps/binx-web/src/components/forms/agency/NewAgencyForm/NewAgencyForm.tsx
 * @author Binx.io
 */
"use client";

import { useRouter } from "next/navigation";

import CreateAgencyForm from "@/components/forms/agency/CreateAgencyForm/CreateAgencyForm";

const NewAgencyForm = () => {
  const router = useRouter();

  return <CreateAgencyForm onCreated={() => router.push("/dashboard")} onCancel={() => router.back()} />;
};

export default NewAgencyForm;
