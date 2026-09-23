/**
 * NewLeadForm.tsx
 *
 * Thin client wrapper around the shared `LeadForm` for the dedicated
 * `/leads/new` page: supplies the "where to go on success" behavior
 * (straight to the new lead's own page) that a page needs but a
 * dialog-hosted create flow didn't. Replaces the old CreateLeadDialog.
 *
 * @module apps/binx-web/src/components/leads/NewLeadForm/NewLeadForm.tsx
 * @author Binx.io
 */
"use client";

import { useRouter } from "next/navigation";

import LeadForm from "@/components/leads/LeadForm/LeadForm";

interface NewLeadFormProps {
  agencyId: string;
}

const NewLeadForm = ({ agencyId }: NewLeadFormProps) => {
  const router = useRouter();

  return <LeadForm agencyId={agencyId} onSuccess={(lead) => router.push(`/leads/${lead.id}`)} />;
};

export default NewLeadForm;
