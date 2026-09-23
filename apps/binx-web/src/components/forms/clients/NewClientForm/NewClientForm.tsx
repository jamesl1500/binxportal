/**
 * NewClientForm.tsx
 *
 * Thin client wrapper around the shared `ClientForm` for the dedicated
 * `/clients/new` page: supplies the "where to go on success" behavior
 * (straight to the new client's own page) that a page needs but a
 * dialog-hosted create flow didn't. Replaces the old CreateClientDialog.
 *
 * @module apps/binx-web/src/components/forms/clients/NewClientForm/NewClientForm.tsx
 * @author Binx.io
 */
"use client";

import { useRouter } from "next/navigation";

import ClientForm from "@/components/forms/clients/ClientForm/ClientForm";

interface NewClientFormProps {
  agencyId: string;
}

const NewClientForm = ({ agencyId }: NewClientFormProps) => {
  const router = useRouter();

  return <ClientForm agencyId={agencyId} onSuccess={(client) => router.push(`/clients/${client.id}`)} />;
};

export default NewClientForm;
