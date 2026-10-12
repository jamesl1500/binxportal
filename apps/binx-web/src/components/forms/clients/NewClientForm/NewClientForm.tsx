/**
 * NewClientForm.tsx
 *
 * Thin client wrapper around the shared `ClientForm` for the dedicated
 * `/clients/new` page: supplies the "where to go on success" behavior
 * that a page needs but a dialog-hosted create flow didn't — on to the
 * portal-setup step (branding + portal invite) for staff who can manage
 * the client's portal, straight to the new client's own page for everyone
 * else. Replaces the old CreateClientDialog.
 *
 * @module apps/binx-web/src/components/forms/clients/NewClientForm/NewClientForm.tsx
 * @author Binx Portal
 */
"use client";

import { useRouter } from "next/navigation";

import ClientForm from "@/components/forms/clients/ClientForm/ClientForm";

interface NewClientFormProps {
  agencyId: string;
  /** Owner/admin — the only roles the portal-setup step is open to. */
  canManagePortal: boolean;
}

const NewClientForm = ({ agencyId, canManagePortal }: NewClientFormProps) => {
  const router = useRouter();

  return (
    <ClientForm
      agencyId={agencyId}
      onSuccess={(client) =>
        router.push(
          canManagePortal
            ? `/clients/new/portal-setup?clientId=${client.id}`
            : `/clients/${client.id}`,
        )
      }
    />
  );
};

export default NewClientForm;
