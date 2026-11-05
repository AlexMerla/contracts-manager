// highlevel-whatsapp R1/R6/R7 — the app's only door to HighLevel (ru42, the
// client's CRM). A thin `fetch` wrapper plus the three calls the WhatsApp
// delivery needs, and nothing else:
//
//   POST /contacts/upsert                      (find-or-create by phone)
//   PUT  /contacts/{id}                        (name, ONLY for a contact we just created)
//   POST /contacts/{id}/workflow/{workflowId}  (enrollment = the WhatsApp send)
//
// Marketing owns every pre-existing ru42 resource (constraint
// `ru42-marketing-owned`). This module therefore exposes NO delete, NO tag
// write, NO workflow/field/template write, and the upsert body is built here,
// in one place, as exactly `{ locationId, phone, customFields }`.
//
// Same "never throws" contract as `googleApiFetch` and every delivery step
// (spec §4.2): transport errors and HTTP errors become `{ ok: false }` with a
// fixed es-MX message. Raw response bodies are NEVER surfaced or logged — they
// carry the client's name, phone and email (R7). Logs carry only the
// operation name and the HTTP status.

const HIGHLEVEL_API_BASE = "https://services.leadconnectorhq.com";
// Verified live 2026-11-05 on upsert and add-to-workflow (both 201).
const HIGHLEVEL_API_VERSION = "v3";

export type HighLevelResult<T> = { ok: true; data: T } | { ok: false; message: string };

export const HIGHLEVEL_NETWORK_MESSAGE = "No se pudo conectar con HighLevel.";
const INVALID_RESPONSE_MESSAGE = "HighLevel respondió algo que no se pudo interpretar.";
const WORKFLOW_NOT_CONFIRMED_MESSAGE = "HighLevel no confirmó el envío al flujo de WhatsApp.";

/** es-MX message for an HTTP failure. Exported for the unit test only. */
export function highLevelStatusMessage(status: number): string {
  if (status === 401) {
    return "HighLevel rechazó el token de acceso.";
  }
  if (status === 403) {
    return "El token de HighLevel no tiene permiso para esta operación.";
  }
  if (status === 400 || status === 422) {
    return "HighLevel rechazó los datos enviados.";
  }
  if (status === 429) {
    return "HighLevel limitó las solicitudes; intente de nuevo en unos minutos.";
  }
  if (status >= 500) {
    return "HighLevel no está disponible por el momento.";
  }
  return `HighLevel respondió con un error (HTTP ${status}).`;
}

interface HighLevelRequest {
  token: string;
  path: string;
  method: "POST" | "PUT";
  body: unknown;
  /** English, log-only label — never interpolated into user-facing text. */
  operation: string;
}

async function highLevelFetch(request: HighLevelRequest): Promise<HighLevelResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(`${HIGHLEVEL_API_BASE}${request.path}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${request.token}`,
        Version: HIGHLEVEL_API_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request.body),
    });
  } catch {
    console.error(`HighLevel ${request.operation} failed: network error`);
    return { ok: false, message: HIGHLEVEL_NETWORK_MESSAGE };
  }

  if (!response.ok) {
    console.error(`HighLevel ${request.operation} failed: HTTP ${response.status}`);
    return { ok: false, message: highLevelStatusMessage(response.status) };
  }

  try {
    return { ok: true, data: (await response.json()) as unknown };
  } catch {
    console.error(`HighLevel ${request.operation} failed: unreadable body (HTTP ${response.status})`);
    return { ok: false, message: INVALID_RESPONSE_MESSAGE };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface HighLevelCustomField {
  /** Field key WITHOUT the `contact.` prefix — verified live 2026-11-05. */
  key: string;
  field_value: string;
}

export interface UpsertContactInput {
  token: string;
  locationId: string;
  /** E.164 `+52XXXXXXXXXX` — see `normalizeMexicanMobile`. */
  phone: string;
  customFields: HighLevelCustomField[];
}

export interface UpsertedContact {
  contactId: string;
  /** `true` only when HighLevel created the contact on this call. */
  isNew: boolean;
}

/**
 * Upserts by phone. The body is EXACTLY `{ locationId, phone, customFields }`
 * (R1): no name/email (marketing's data), never `tags` (HighLevel REPLACES
 * all tags), never `createNewIfDuplicateAllowed` (no duplicate contacts).
 * Verified live: an existing contact keeps its name, tags and other fields.
 */
export async function upsertContact(
  input: UpsertContactInput
): Promise<HighLevelResult<UpsertedContact>> {
  const result = await highLevelFetch({
    token: input.token,
    path: "/contacts/upsert",
    method: "POST",
    body: { locationId: input.locationId, phone: input.phone, customFields: input.customFields },
    operation: "contact upsert",
  });
  if (!result.ok) {
    return result;
  }

  const { data } = result;
  const contact = isRecord(data) && isRecord(data.contact) ? data.contact : null;
  if (!contact || typeof contact.id !== "string" || contact.id === "") {
    console.error("HighLevel contact upsert failed: no contact id in response");
    return { ok: false, message: INVALID_RESPONSE_MESSAGE };
  }
  return { ok: true, data: { contactId: contact.id, isNew: isRecord(data) && data.new === true } };
}

/** `PUT /contacts/{id}` with `{ name }` and nothing else. Callers invoke it
 * ONLY when the upsert reported `isNew` — an existing contact's name belongs
 * to marketing (R1). */
export async function setNewContactName(input: {
  token: string;
  contactId: string;
  name: string;
}): Promise<HighLevelResult<null>> {
  const result = await highLevelFetch({
    token: input.token,
    path: `/contacts/${encodeURIComponent(input.contactId)}`,
    method: "PUT",
    body: { name: input.name },
    operation: "new contact name",
  });
  return result.ok ? { ok: true, data: null } : result;
}

/**
 * Enrolls the contact in one of OUR workflows, whose single action sends the
 * Meta-approved WhatsApp template. Re-entry is allowed on those workflows, so
 * a second enrollment sends a second message (verified live). Success is a
 * 2xx whose body says `succeeded: true` — HighLevel also returns the typo key
 * `succeded`, accepted too.
 */
export async function addContactToWorkflow(input: {
  token: string;
  contactId: string;
  workflowId: string;
}): Promise<HighLevelResult<null>> {
  const result = await highLevelFetch({
    token: input.token,
    path: `/contacts/${encodeURIComponent(input.contactId)}/workflow/${encodeURIComponent(input.workflowId)}`,
    method: "POST",
    body: {},
    operation: "workflow enrollment",
  });
  if (!result.ok) {
    return result;
  }
  const { data } = result;
  const succeeded = isRecord(data) && (data.succeeded === true || data.succeded === true);
  if (!succeeded) {
    console.error("HighLevel workflow enrollment failed: response did not confirm success");
    return { ok: false, message: WORKFLOW_NOT_CONFIRMED_MESSAGE };
  }
  return { ok: true, data: null };
}
