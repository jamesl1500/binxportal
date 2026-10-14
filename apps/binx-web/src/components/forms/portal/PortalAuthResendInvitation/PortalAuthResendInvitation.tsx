/**
 * PortalAuthResendInvitation.tsx - Client Portal Resend Invitation Form
 *
 * Lets an invited client ask for their portal invitation email again: they
 * name the agency (with suggestions — see AgencyNameField) and give the email
 * the invitation was sent to. binx-api re-sends it only if that agency has an
 * active invitation for that address, and answers the same either way, so
 * the confirmation here never says whether one was found.
 *
 * @module apps/binx-web/src/components/forms/portal/PortalAuthResendInvitation/PortalAuthResendInvitation.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { resendPortalInvitationAction } from "@/app/(portal-auth)/portal/resend-invitation/actions";
import AgencyNameField from "@/components/forms/portal/PortalAuthResendInvitation/AgencyNameField";
import styles from "@/components/forms/portal/PortalAuthResendInvitation/PortalAuthResendInvitation.module.scss";

/**
 * PortalResendInvitation Schema
 *
 * Should only need the email field and Agency Name.
 *
 * @constant {z.ZodObject} PortalResendInvitationSchema
 */
const PortalResendInvitationSchema = z.object({
    email: z.email("Enter a valid email address"),
    agency_name: z.string().trim().min(1, "Agency name is required"),
    // Set when the agency is picked from the suggestions (see AgencyNameField),
    // cleared if the name is then edited by hand.
    agency_id: z.string().optional(),
});

type PortalResendInvitationForm = z.infer<typeof PortalResendInvitationSchema>;

const PortalAuthResendInvitation = () => {
    const [isPending, startTransition] = useTransition();
    const [formError, setFormError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<PortalResendInvitationForm>({
        resolver: zodResolver(PortalResendInvitationSchema),
        defaultValues: { email: "", agency_name: "" },
    });

    const onSubmit = (values: PortalResendInvitationForm) => {
        setFormError(null);

        startTransition(async () => {
            const result = await resendPortalInvitationAction({
                email: values.email,
                agencyName: values.agency_name,
                agencyId: values.agency_id,
            });

            if (result.error) {
                setFormError(result.error);
            }

            if (result.message) {
                setSuccessMessage(result.message);
            }
        });
    };

    if (successMessage) {
        return (
            <div className={styles.form}>
                <p className={styles.formSuccess}>{successMessage}</p>
                <p className={styles.hint}>
                    Nothing after a few minutes? Check your spam folder, make
                    sure it&apos;s the email your agency invited, or ask them
                    to send a new invitation — invitations expire, and only
                    your agency can renew one.
                </p>
            </div>
        );
    }

    return (
        <form
            className={styles.form}
            onSubmit={handleSubmit(onSubmit)}
            noValidate
        >
            <div className={styles.field}>
                <label className={styles.label} htmlFor="agencyName">Agency Name</label>
                <AgencyNameField
                    id="agencyName"
                    registration={register("agency_name")}
                    invalid={Boolean(errors.agency_name)}
                    onSelect={(agency) => {
                        setValue("agency_id", agency?.id);
                        if (agency) {
                            setValue("agency_name", agency.name, {
                                shouldValidate: true,
                            });
                        }
                    }}
                />
                {errors.agency_name && (
                    <span className={styles.error}>
                        {errors.agency_name.message}
                    </span>
                )}
            </div>
            <div className={styles.field}>
                <label className={styles.label} htmlFor="email">Email</label>
                <input
                    className={styles.input}
                    id="email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    {...register("email")}
                />
                {errors.email && (
                    <span className={styles.error}>
                        {errors.email.message}
                    </span>
                )}
            </div>

            {formError && <p className={styles.formError}>{formError}</p>}

            <button
                className={styles.button}
                type="submit"
                disabled={isPending}
            >
                {isPending ? "Sending…" : "Resend Invitation"}
            </button>
        </form>
    );
};

export default PortalAuthResendInvitation;
