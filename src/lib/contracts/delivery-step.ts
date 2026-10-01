/**
 * What a single post-confirmation delivery step (image, Drive, Calendar,
 * email, WhatsApp) reports back to `createContract` and to its manual retry
 * action.
 *
 * Lives here, not in `@/lib/google/api-client`, because sprint-07 adds two
 * NON-Google steps (Resend, ManyChat) that must speak the same contract:
 * spec §4.2 requires every step to convert its own failures into a value
 * instead of throwing, so a Resend outage can't stop the ManyChat trigger and
 * neither can stop contract creation from returning success.
 * `api-client.ts` re-exports this type, so every pre-existing import of it
 * keeps working unchanged.
 */
export type ContractDeliveryStepResult = { ok: true } | { ok: false; message: string };

/** Shared `unknown` → message narrowing used by every step module. */
export function stepErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
