// Cloudflare Turnstile server-side verification (public-precontract Q3).
//
// First bot-check in this codebase. Deliberately NO vendor SDK: the whole
// contract is one form-encoded POST, exactly like `highLevelFetch` in
// `@/lib/highlevel/client` and `googleApiFetch` in `@/lib/google/api-client`
// — this project's established pattern is a thin `fetch` wrapper that turns
// every failure into a value rather than pulling in a dependency.
//
// `fetchImpl` is injectable for the same reason `sendContractWhatsAppMessage`
// takes plain data: the exchange must be unit-testable without a real network
// call and without real Cloudflare keys (there are none in CI or in vitest).

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Client-facing, es-MX, formal register (docs/design-system.md §3). Never
 * leaks which Cloudflare error-code came back — an anonymous caller learns
 * only that the check did not pass. */
const GENERIC_FAILURE =
  "No pudimos verificar que sea una persona. Recargue la página e inténtelo de nuevo.";

export type TurnstileVerification = { ok: true } | { ok: false; message: string };

/** Shape of Cloudflare's siteverify response we actually read. */
interface SiteverifyResponse {
  success?: boolean;
  "error-codes"?: string[];
}

export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Verifies a Turnstile token against Cloudflare.
 *
 * FAILS CLOSED in every uncertain case — a missing `TURNSTILE_SECRET_KEY`, a
 * transport error, an unparseable body, a non-2xx status and `success:false`
 * all return `ok: false`. That is the opposite of the delivery-pipeline steps'
 * fail-open contract (§4.2), and deliberately so: a delivery step failing
 * must not block a contract that already exists, whereas this gate is the only
 * thing standing between an anonymous POST and a real Drive file, a real
 * Calendar event, a real email and a real WhatsApp send.
 *
 * Local/CI note: Cloudflare publishes always-pass test keys
 * (site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`)
 * so a developer never needs a real zone to run the flow.
 */
export async function verifyTurnstileToken(
  token: string,
  options: { remoteIp?: string | null; fetchImpl?: FetchLike } = {}
): Promise<TurnstileVerification> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY no está configurada — rechazando el envío público.");
    return { ok: false, message: GENERIC_FAILURE };
  }

  if (!token.trim()) {
    return { ok: false, message: GENERIC_FAILURE };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (options.remoteIp) {
    body.set("remoteip", options.remoteIp);
  }

  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await doFetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (error: unknown) {
    console.error("La solicitud de verificación a Turnstile falló:", error);
    return { ok: false, message: GENERIC_FAILURE };
  }

  let payload: SiteverifyResponse;
  try {
    payload = (await response.json()) as SiteverifyResponse;
  } catch {
    console.error(`Turnstile devolvió un cuerpo no interpretable (HTTP ${response.status}).`);
    return { ok: false, message: GENERIC_FAILURE };
  }

  if (!response.ok || payload.success !== true) {
    console.error(
      `Verificación de Turnstile rechazada (HTTP ${response.status}): ${(payload["error-codes"] ?? []).join(", ") || "sin detalle"}`
    );
    return { ok: false, message: GENERIC_FAILURE };
  }

  return { ok: true };
}
