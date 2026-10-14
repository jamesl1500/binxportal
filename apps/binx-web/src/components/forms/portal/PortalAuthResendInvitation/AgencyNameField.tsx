/**
 * AgencyNameField.tsx
 *
 * The "which agency invited you?" input on the resend-invitation form: a
 * text field that suggests matching agencies as the client types, so they
 * can pick the right one instead of having to spell it exactly.
 *
 * It stays an ordinary react-hook-form input (the parent passes its
 * `register()` result), so typing a name without picking a suggestion still
 * works. Picking one reports the agency through `onSelect`; typing again
 * afterwards reports `null`, because the text no longer names that agency.
 *
 * Follows the ARIA combobox pattern: arrow keys move through the list,
 * Enter picks, Escape closes.
 *
 * @module apps/binx-web/src/components/forms/portal/PortalAuthResendInvitation/AgencyNameField.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { searchPortalAgenciesAction } from "@/app/(portal-auth)/portal/resend-invitation/actions";
import type { PortalAgencyMatch } from "@/lib/portal";

import styles from "./PortalAuthResendInvitation.module.scss";

/** Shorter than this and binx-api returns nothing — don't bother asking. */
const MIN_QUERY_LENGTH = 2;
/** Wait for a pause in typing before searching. */
const SEARCH_DELAY_MS = 200;

interface AgencyNameFieldProps {
  id: string;
  registration: UseFormRegisterReturn;
  invalid?: boolean;
  /** The picked agency, or `null` once the text is edited after a pick. */
  onSelect: (agency: PortalAgencyMatch | null) => void;
}

const AgencyNameField = ({
  id,
  registration,
  invalid,
  onSelect,
}: AgencyNameFieldProps) => {
  const listId = useId();
  const [query, setQuery] = useState("");
  // The last finished search and the text it was for — the list only shows
  // while that text is still what's in the field, never stale results.
  const [results, setResults] = useState<{
    term: string;
    matches: PortalAgencyMatch[];
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // The name just picked — its own text shouldn't trigger another search.
  const pickedName = useRef<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY_LENGTH || term === pickedName.current) return;

    // Results can arrive out of order; only the latest request may land.
    let current = true;
    const timer = setTimeout(async () => {
      const found = await searchPortalAgenciesAction(term);
      if (!current) return;
      setResults({ term, matches: found });
      setActiveIndex(-1);
      setOpen(true);
    }, SEARCH_DELAY_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const matches = results?.term === query.trim() ? results.matches : null;
  const showList = open && matches !== null;

  const pick = (agency: PortalAgencyMatch) => {
    pickedName.current = agency.name;
    setQuery(agency.name);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(agency);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void registration.onChange(event);
    pickedName.current = null;
    setQuery(event.target.value);
    onSelect(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList || !matches || matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? matches.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      // Pick the highlighted agency rather than submitting the form.
      event.preventDefault();
      pick(matches[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={styles.combobox}>
      <input
        {...registration}
        id={id}
        className={styles.input}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={
          showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        aria-invalid={invalid}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          void registration.onBlur(event);
          setOpen(false);
        }}
      />

      {showList && matches && (
        <ul id={listId} className={styles.options} role="listbox">
          {matches.length === 0 ? (
            <li className={styles.noOptions} role="presentation">
              No agency found by that name — check the spelling.
            </li>
          ) : (
            matches.map((agency, index) => (
              <li
                key={agency.id}
                id={`${listId}-${index}`}
                className={styles.option}
                role="option"
                aria-selected={index === activeIndex}
                // mousedown, not click: it fires before the input's blur
                // closes the list out from under the pointer.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(agency);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {agency.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

export default AgencyNameField;
