/**
 * AiSettingsMenu.tsx
 *
 * The "Ask AI" modal's settings dropdown — the signed-in member's own
 * preferences for the assistant (answer length, tone, whether it may make
 * changes and whether each needs their approval, voice auto-send, standing
 * instructions). Personal, not agency-wide: the owner/admin budget controls
 * live in Settings → AI (AiSettingsPanel) instead.
 *
 * Every control saves as soon as it changes (the custom-instructions box on
 * blur) through `onChange`; the modal owns the state and the save.
 *
 * @module apps/binx-web/src/components/ai/AiSettingsMenu/AiSettingsMenu.tsx
 * @author Binx.io
 */
"use client";

import { useId, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Switch } from "@base-ui/react/switch";
import { Settings2 } from "lucide-react";

import type { AiPreferences } from "@/lib/ai";

import styles from "./AiSettingsMenu.module.scss";

interface AiSettingsMenuProps {
  /** null while still loading — the trigger is disabled until then. */
  preferences: AiPreferences | null;
  onChange: (next: AiPreferences) => void;
}

const LENGTHS: { value: AiPreferences["response_length"]; label: string }[] = [
  { value: "concise", label: "Concise" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

const TONES: { value: AiPreferences["tone"]; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "casual", label: "Casual" },
];

const MAX_INSTRUCTIONS = 1000;

interface SegmentedProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
}

function Segmented<T extends string>({ label, options, value, onSelect }: SegmentedProps<T>) {
  return (
    <div className={styles.field} role="radiogroup" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <div className={styles.segmented}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={styles.segment}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ToggleProps {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function Toggle({ label, hint, checked, disabled, onCheckedChange }: ToggleProps) {
  const id = useId();
  return (
    <div className={styles.toggleRow} data-disabled={disabled ? "true" : undefined}>
      <div>
        <label className={styles.toggleLabel} htmlFor={id}>
          {label}
        </label>
        <p className={styles.toggleHint}>{hint}</p>
      </div>
      <Switch.Root
        id={id}
        className={styles.switch}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      >
        <Switch.Thumb className={styles.thumb} />
      </Switch.Root>
    </div>
  );
}

/** The popup's body — mounted fresh each time the dropdown opens, so the
 * instructions draft starts from the saved value every time. */
function SettingsForm({ preferences, onChange }: { preferences: AiPreferences; onChange: AiSettingsMenuProps["onChange"] }) {
  const instructionsId = useId();
  const [instructions, setInstructions] = useState(preferences.custom_instructions ?? "");
  const update = (patch: Partial<AiPreferences>) => onChange({ ...preferences, ...patch });

  const saveInstructions = () => {
    const next = instructions.trim() || null;
    if (next !== preferences.custom_instructions) update({ custom_instructions: next });
  };

  return (
    <div className={styles.form}>
      <Segmented
        label="Answer length"
        options={LENGTHS}
        value={preferences.response_length}
        onSelect={(response_length) => update({ response_length })}
      />
      <Segmented label="Tone" options={TONES} value={preferences.tone} onSelect={(tone) => update({ tone })} />

      <Toggle
        label="Let AI make changes"
        hint="Create leads and tasks, update statuses, assign work."
        checked={preferences.allow_actions}
        onCheckedChange={(allow_actions) => update({ allow_actions })}
      />
      <Toggle
        label="Ask before each change"
        hint="Changes wait for your Approve. Off: they happen right away."
        checked={preferences.confirm_actions}
        disabled={!preferences.allow_actions}
        onCheckedChange={(confirm_actions) => update({ confirm_actions })}
      />
      <Toggle
        label="Send voice messages automatically"
        hint="Off: what you say lands in the message box to review first."
        checked={preferences.voice_auto_send}
        onCheckedChange={(voice_auto_send) => update({ voice_auto_send })}
      />

      <div className={styles.field}>
        <label className={styles.label} htmlFor={instructionsId}>
          Custom instructions
        </label>
        <textarea
          id={instructionsId}
          className={styles.textarea}
          rows={3}
          maxLength={MAX_INSTRUCTIONS}
          placeholder="e.g. Always include due dates. Use bullet points."
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          onBlur={saveInstructions}
        />
      </div>
    </div>
  );
}

const AiSettingsMenu = ({ preferences, onChange }: AiSettingsMenuProps) => (
  <Popover.Root>
    <Popover.Trigger className={styles.trigger} aria-label="AI settings" disabled={!preferences}>
      <Settings2 aria-hidden="true" />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner className={styles.positioner} sideOffset={8} align="end">
        <Popover.Popup className={styles.popup}>
          <Popover.Title className={styles.title}>Your AI settings</Popover.Title>
          {preferences && <SettingsForm preferences={preferences} onChange={onChange} />}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
);

export default AiSettingsMenu;
