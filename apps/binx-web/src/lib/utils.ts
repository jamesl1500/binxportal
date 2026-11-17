import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Same mailbox address, compared the way binx-api compares an invitation's
 * email with the accepting account's (case-insensitive, exact otherwise).
 * Plus-addresses are deliberately NOT folded: "hello+client@x" is its own
 * identity, and treating it as "hello@x" would let one account claim
 * another's invitation.
 */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
