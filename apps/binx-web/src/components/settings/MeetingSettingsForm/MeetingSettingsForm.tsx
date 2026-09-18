/**
 * MeetingSettingsForm.tsx
 *
 * The agency's scheduling defaults: timezone, slot length, how much notice
 * a client needs to give, how far out they can book, and a kill switch for
 * self-service booking entirely. Owner/admin only — members see a read-only
 * summary. Same shape as BillingSettingsForm.
 *
 * @module apps/binx-web/src/components/settings/MeetingSettingsForm/MeetingSettingsForm.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@base-ui/react/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { updateMeetingSettingsAction } from "@/app/(app)/settings/meetings/actions";
import type { MeetingSettings } from "@/lib/meetings";

import styles from "./MeetingSettingsForm.module.scss";

const schema = z.object({
  timezone: z.string().min(1, "Choose a timezone"),
  slotMinutes: z.number().int().min(5).max(480),
  bookingNoticeHours: z.number().int().min(0).max(720),
  bookingWindowDays: z.number().int().min(1).max(365),
});

type Values = z.infer<typeof schema>;

interface MeetingSettingsFormProps {
  agencyId: string;
  settings: MeetingSettings;
  canManage: boolean;
}

/** Falls back to a short, common list if the runtime doesn't support
 * Intl.supportedValuesOf (widely available in modern Node/browsers, but
 * this keeps the form from breaking anywhere it isn't). */
function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London"];
  }
}

const MeetingSettingsForm = ({ agencyId, settings, canManage }: MeetingSettingsFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selfBookingEnabled, setSelfBookingEnabled] = useState(settings.self_booking_enabled);
  const timezones = useMemo(() => timezoneOptions(), []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      timezone: settings.timezone,
      slotMinutes: settings.slot_minutes,
      bookingNoticeHours: settings.booking_notice_hours,
      bookingWindowDays: settings.booking_window_days,
    },
  });

  if (!canManage) {
    return (
      <div className={styles.readonly}>
        <p className={styles.readonlyNote}>Only an owner or admin can change meeting settings.</p>
        <dl className={styles.summary}>
          <div>
            <dt>Timezone</dt>
            <dd>{settings.timezone}</dd>
          </div>
          <div>
            <dt>Slot length</dt>
            <dd>{settings.slot_minutes} min</dd>
          </div>
          <div>
            <dt>Booking notice</dt>
            <dd>{settings.booking_notice_hours}h</dd>
          </div>
          <div>
            <dt>Self-service booking</dt>
            <dd>{settings.self_booking_enabled ? "On" : "Off"}</dd>
          </div>
        </dl>
      </div>
    );
  }

  const onSubmit = (values: Values) => {
    setFormError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateMeetingSettingsAction(agencyId, {
        timezone: values.timezone,
        slot_minutes: values.slotMinutes,
        booking_notice_hours: values.bookingNoticeHours,
        booking_window_days: values.bookingWindowDays,
        self_booking_enabled: selfBookingEnabled,
      });
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="timezone">
          Timezone
        </label>
        <select id="timezone" className={styles.select} {...register("timezone")}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {errors.timezone && <p className={styles.error}>{errors.timezone.message}</p>}
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="slotMinutes">
            Slot length (minutes)
          </label>
          <input
            id="slotMinutes"
            type="number"
            min="5"
            max="480"
            className={styles.input}
            {...register("slotMinutes", { valueAsNumber: true })}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="bookingNoticeHours">
            Booking notice (hours)
          </label>
          <input
            id="bookingNoticeHours"
            type="number"
            min="0"
            max="720"
            className={styles.input}
            {...register("bookingNoticeHours", { valueAsNumber: true })}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="bookingWindowDays">
            Booking window (days)
          </label>
          <input
            id="bookingWindowDays"
            type="number"
            min="1"
            max="365"
            className={styles.input}
            {...register("bookingWindowDays", { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className={styles.switchRow}>
        <div>
          <p className={styles.label}>Self-service booking</p>
          <p className={styles.hint}>Let clients book an open slot themselves from their portal.</p>
        </div>
        <Switch.Root
          checked={selfBookingEnabled}
          onCheckedChange={setSelfBookingEnabled}
          className={styles.switch}
          aria-label="Self-service booking"
        >
          <Switch.Thumb className={styles.thumb} />
        </Switch.Root>
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {saved && <p className={styles.formSuccess}>Meeting settings saved.</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving…" : "Save meeting settings"}
      </button>
    </form>
  );
};

export default MeetingSettingsForm;
