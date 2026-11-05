// highlevel-whatsapp R5 — the ONE place a stored `clientMobile` becomes the
// phone HighLevel (ru42) matches contacts by.
//
// Format: `+52` + 10 digits, NOT the legacy WhatsApp `+521…` mobile form.
// Verified live on 2026-11-05 (smoke test): contacts created by an inbound
// WhatsApp message are stored as `+52XXXXXXXXXX`, and a duplicate search with
// `+521XXXXXXXXXX` finds nothing — so upserting the `521` form would CREATE A
// SECOND CONTACT for a client marketing already has. Mexico dropped the `1`
// mobile prefix in 2019; it only survives in old address books, which is why
// it is still accepted (and stripped) on input.

const MEXICO_COUNTRY_CODE = "52";
const NATIONAL_NUMBER_LENGTH = 10;

/**
 * Normalizes a Mexican mobile to E.164 `+52XXXXXXXXXX`, or `null` when the
 * input cannot be one.
 *
 * Accepted, after stripping everything that is not a digit (spaces, dashes,
 * parentheses, a leading `+`):
 *  - 10 digits: the national number itself;
 *  - `1` + 10 digits: the pre-2019 mobile prefix;
 *  - `52` + 10 digits;
 *  - `521` + 10 digits.
 *
 * Anything else (short numbers, other country codes, extensions) is `null`,
 * so an unusable value never reaches the CRM and never creates a junk contact.
 */
export function normalizeMexicanMobile(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const national = nationalNumber(digits);
  return national ? `+${MEXICO_COUNTRY_CODE}${national}` : null;
}

function nationalNumber(digits: string): string | null {
  const prefixes = ["", "1", MEXICO_COUNTRY_CODE, `${MEXICO_COUNTRY_CODE}1`];
  const prefix = prefixes.find(
    (candidate) =>
      digits.length === candidate.length + NATIONAL_NUMBER_LENGTH && digits.startsWith(candidate)
  );
  return prefix === undefined ? null : digits.slice(prefix.length);
}
