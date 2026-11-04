import { contractViewerUrl } from "@/lib/app-url";
import { clientFacingImage } from "@/lib/contract-template/client-facing-variant";
import {
  stepErrorMessage,
  type ContractDeliveryStepResult,
} from "@/lib/contracts/delivery-step";
import { prisma } from "@/lib/prisma";

// Sprint-07 task 4 — hand the public viewer link to ManyChat, which is what
// actually sends the WhatsApp message (spec §3: "the app's responsibility is
// only to produce the public viewer link").
//
// Ported from the legacy system (`events-manager/services/whatsapp/index.ts`),
// which drives the SAME ManyChat account and the same flow, so the three-call
// shape (find-or-create subscriber → set custom fields → send flow) and the
// `521` phone normalisation are business logic to preserve, not rewrite.
// Differences from the legacy port, all deliberate:
//  * never throws — every failure becomes a `ContractDeliveryStepResult`,
//    like every other step in the §4.2 pipeline;
//  * the contract-link field carries the FULL absolute URL, not a bare JWT
//    (see `MANYCHAT_FIELD_CONTRACT_LINK` below);
//  * no JWT at all: `viewerToken` is a permanent `randomUUID()` (spec §6.4).
//
// There is NO `whatsappTriggered` column (spec §6.4 defines none, and the
// product decision for this sprint is to keep it that way). A failure here is
// logged and otherwise invisible — task 5's copyable link on the contract
// detail page is the deliberate manual fallback.

const MANYCHAT_API = "https://api.manychat.com";

interface ManyChatSubscriber {
  id: string;
  whatsapp_phone?: string | null;
}

interface ManyChatEnvelope<T> {
  status?: string;
  data?: T;
  message?: string;
  details?: unknown;
}

type ManyChatResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** What every ManyChat exchange needs: the API key and the custom field the
 * subscriber's phone is stored in (used to find them). */
interface ManyChatConnection {
  apiKey: string;
  phoneFieldId: string;
}

interface ManyChatConfig extends ManyChatConnection {
  contractLinkFieldId: string;
  folioFieldId: string;
  flowId: string;
}

/** payment-receipt R4 — a dedicated flow and fields: reusing the contract
 * flow would send the contract message with a receipt link in it. */
interface ManyChatReceiptConfig extends ManyChatConnection {
  receiptLinkFieldId: string;
  receiptFolioFieldId: string;
  receiptAmountFieldId: string;
  receiptBalanceFieldId: string;
  receiptFlowId: string;
}

/** All the named variables or none — a partial configuration would produce a
 * subscriber with no link, i.e. a WhatsApp message pointing nowhere. */
function readEnvConfig<K extends string>(names: Record<K, string>): ManyChatResult<Record<K, string>> {
  const keys = Object.keys(names) as K[];
  const values = Object.fromEntries(
    keys.map((key) => [key, process.env[names[key]]?.trim() ?? ""])
  ) as Record<K, string>;

  const missing = keys.filter((key) => !values[key]);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Falta configurar ${missing.map((key) => names[key]).join(", ")} para enviar el WhatsApp.`,
    };
  }
  return { ok: true, data: values };
}

function readConfig(): ManyChatResult<ManyChatConfig> {
  return readEnvConfig({
    apiKey: "MANYCHAT_API_KEY",
    phoneFieldId: "WHATSAPP_PHONE_FIELD_ID",
    contractLinkFieldId: "MANYCHAT_FIELD_CONTRACT_LINK",
    folioFieldId: "MANYCHAT_FIELD_FOLIO",
    flowId: "MANYCHAT_FLOW_ID",
  });
}

function readReceiptConfig(): ManyChatResult<ManyChatReceiptConfig> {
  return readEnvConfig({
    apiKey: "MANYCHAT_API_KEY",
    phoneFieldId: "WHATSAPP_PHONE_FIELD_ID",
    receiptLinkFieldId: "MANYCHAT_FIELD_RECEIPT_LINK",
    receiptFolioFieldId: "MANYCHAT_FIELD_RECEIPT_FOLIO",
    receiptAmountFieldId: "MANYCHAT_FIELD_RECEIPT_AMOUNT",
    receiptBalanceFieldId: "MANYCHAT_FIELD_RECEIPT_BALANCE",
    receiptFlowId: "MANYCHAT_RECEIPT_FLOW_ID",
  });
}

/**
 * Mexican mobile in the digits-only form ManyChat stores (`521` + 10 digits,
 * sent to the API prefixed with `+`). Exact port of the legacy rule, with one
 * addition: anything shorter than 10 digits is rejected outright rather than
 * forwarded as-is, so an obviously unusable number never reaches ManyChat and
 * never creates a junk subscriber.
 *
 * Returns `null` when the input cannot be a phone number.
 */
export function normalizeMexicanMobile(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `521${digits}`;
  }
  if (digits.startsWith("521")) {
    return digits;
  }
  if (digits.startsWith("52")) {
    return `521${digits.slice(2)}`;
  }
  return digits.length >= 10 ? digits : null;
}

/** ManyChat replies `200 OK` with `{"status":"error", ...}` for business
 * errors, so the HTTP status alone is not a success signal — both are
 * checked. Never throws: a transport error becomes a failure value, same
 * contract as `googleApiFetch`. */
async function manyChatFetch<T>(params: {
  config: ManyChatConnection;
  path: string;
  method?: string;
  body?: unknown;
  /** Spanish infinitive phrase: "No se pudo <operation>". */
  operation: string;
}): Promise<ManyChatResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${MANYCHAT_API}${params.path}`, {
      method: params.method ?? "GET",
      headers: {
        Authorization: `Bearer ${params.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: params.body === undefined ? undefined : JSON.stringify(params.body),
    });
  } catch (error: unknown) {
    return { ok: false, message: `No se pudo ${params.operation}: ${stepErrorMessage(error)}` };
  }

  let payload: ManyChatEnvelope<T>;
  try {
    payload = (await response.json()) as ManyChatEnvelope<T>;
  } catch {
    return {
      ok: false,
      message: `ManyChat respondió algo que no se pudo interpretar al ${params.operation} (HTTP ${response.status}).`,
    };
  }

  if (!response.ok || payload.status !== "success") {
    const detail = payload.message ?? `HTTP ${response.status}`;
    return { ok: false, message: `No se pudo ${params.operation}: ${detail}` };
  }

  return { ok: true, data: payload.data as T };
}

async function findOrCreateSubscriber(
  config: ManyChatConnection,
  normalizedPhone: string,
  clientName: string
): Promise<ManyChatResult<string>> {
  const query = new URLSearchParams({
    field_id: config.phoneFieldId,
    field_value: normalizedPhone,
  });

  const found = await manyChatFetch<ManyChatSubscriber[]>({
    config,
    path: `/fb/subscriber/findByCustomField?${query}`,
    operation: "buscar el contacto en ManyChat",
  });

  // A lookup miss is NOT a failure — ManyChat answers `success` with an empty
  // list — so only a hard error short-circuits; otherwise fall through to
  // creating the subscriber.
  if (found.ok) {
    const match = found.data?.find((sub) => sub.whatsapp_phone === `+${normalizedPhone}`);
    if (match) {
      return { ok: true, data: match.id };
    }
  }

  const created = await manyChatFetch<ManyChatSubscriber>({
    config,
    path: "/fb/subscriber/createSubscriber",
    method: "POST",
    body: {
      first_name: clientName,
      whatsapp_phone: `+${normalizedPhone}`,
      has_opt_in_message_whatsapp: true,
    },
    operation: "crear el contacto en ManyChat",
  });
  if (!created.ok) {
    return created;
  }
  if (!created.data?.id) {
    return { ok: false, message: "ManyChat creó el contacto pero no devolvió su identificador." };
  }

  return { ok: true, data: created.data.id };
}

export interface ContractWhatsAppMessage {
  /** Raw `clientMobile` as stored; normalised here. */
  phone: string;
  clientName: string;
  folio: string;
  /** Absolute public viewer URL (spec §10). */
  viewerUrl: string;
}

/**
 * The three ManyChat calls, taking plain data — no database access — so the
 * whole exchange can be unit-tested against a mocked `fetch`. Same split as
 * `buildContractCalendarEvent` / `upsertContractCalendarEvent`.
 */
export async function sendContractWhatsAppMessage(
  message: ContractWhatsAppMessage
): Promise<ContractDeliveryStepResult> {
  const config = readConfig();
  if (!config.ok) {
    return { ok: false, message: config.message };
  }

  const normalizedPhone = normalizeMexicanMobile(message.phone);
  if (!normalizedPhone) {
    return { ok: false, message: `El celular "${message.phone}" no es un número válido.` };
  }

  const subscriber = await findOrCreateSubscriber(
    config.data,
    normalizedPhone,
    message.clientName
  );
  if (!subscriber.ok) {
    return { ok: false, message: subscriber.message };
  }

  // D2 — `MANYCHAT_FIELD_CONTRACT_LINK` carries the FULL absolute URL, where
  // the legacy system sent a bare JWT and let the ManyChat message template
  // prepend the old domain. Sending the whole URL is the only value that is
  // correct on its own: it survives a domain change, it is the exact string
  // staff copy from the detail page (task 5), and it cannot silently point at
  // the decommissioned legacy app. PRECONDITION for task 4: if the live flow's
  // message template still prepends a domain to this field, strip that prefix
  // in ManyChat — not here.
  const fields = await manyChatFetch<null>({
    config: config.data,
    path: "/fb/subscriber/setCustomFields",
    method: "POST",
    body: {
      subscriber_id: subscriber.data,
      fields: [
        { field_id: config.data.contractLinkFieldId, field_value: message.viewerUrl },
        { field_id: config.data.folioFieldId, field_value: message.folio },
      ],
    },
    operation: "guardar los datos del contrato en ManyChat",
  });
  if (!fields.ok) {
    return { ok: false, message: fields.message };
  }

  const flow = await manyChatFetch<null>({
    config: config.data,
    path: "/fb/sending/sendFlow",
    method: "POST",
    body: { subscriber_id: subscriber.data, flow_ns: config.data.flowId },
    operation: "disparar el envío de WhatsApp en ManyChat",
  });
  if (!flow.ok) {
    return { ok: false, message: flow.message };
  }

  return { ok: true };
}

/**
 * Loads the contract and triggers its WhatsApp message. Never throws
 * (spec §4.2). No status column is written — see the module header.
 */
export async function triggerContractWhatsApp(
  contractId: string
): Promise<ContractDeliveryStepResult> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      folio: true,
      clientName: true,
      clientMobile: true,
      viewerToken: true,
      contractStatus: true,
    },
  });
  if (!contract) {
    return { ok: false, message: "Contrato no encontrado." };
  }
  // The message's only payload is the viewer link, and a contract with no
  // client-facing image (cancelled) has a viewer that 404s (spec §10) —
  // sending it would hand the client a dead link. Same rule, same wording,
  // as `sendContractEmail`.
  if (!clientFacingImage(contract.contractStatus)) {
    return { ok: false, message: "El contrato está cancelado; no se envía al cliente." };
  }
  if (!contract.clientMobile) {
    return {
      ok: false,
      message: "El contrato no tiene celular del cliente; no se puede enviar el WhatsApp.",
    };
  }

  let viewerUrl: string;
  try {
    viewerUrl = contractViewerUrl(contract.viewerToken);
  } catch (error: unknown) {
    return { ok: false, message: stepErrorMessage(error) };
  }

  return sendContractWhatsAppMessage({
    phone: contract.clientMobile,
    clientName: contract.clientName,
    folio: contract.folio,
    viewerUrl,
  });
}

export interface ReceiptWhatsAppMessage {
  /** Raw `clientMobile` as stored; normalised here. */
  phone: string;
  clientName: string;
  /** Absolute public receipt URL (spec §10) — built from `receipt_token`. */
  receiptUrl: string;
  paymentFolio: string;
  /** Already formatted for display ("$5,000.00"). */
  amount: string;
  /** Already formatted ("$8,000.00" or "Liquidado"). */
  balance: string;
}

/**
 * payment-receipt R4 — same three calls as `sendContractWhatsAppMessage`
 * (find-or-create, setCustomFields, sendFlow), against the receipt flow and
 * fields. A LINK, never an image: ManyChat's public API has no file upload
 * (checked against its Swagger, 2026-11-02 — `/fb/sending/*` only takes
 * content JSON or a flow), so the client opens the receipt at the public
 * viewer. Plain data in, no database; never throws.
 */
export async function sendReceiptWhatsAppMessage(
  message: ReceiptWhatsAppMessage
): Promise<ContractDeliveryStepResult> {
  const config = readReceiptConfig();
  if (!config.ok) {
    return { ok: false, message: config.message };
  }

  const normalizedPhone = normalizeMexicanMobile(message.phone);
  if (!normalizedPhone) {
    return { ok: false, message: `El celular "${message.phone}" no es un número válido.` };
  }

  const subscriber = await findOrCreateSubscriber(config.data, normalizedPhone, message.clientName);
  if (!subscriber.ok) {
    return { ok: false, message: subscriber.message };
  }

  const fields = await manyChatFetch<null>({
    config: config.data,
    path: "/fb/subscriber/setCustomFields",
    method: "POST",
    body: {
      subscriber_id: subscriber.data,
      fields: [
        { field_id: config.data.receiptLinkFieldId, field_value: message.receiptUrl },
        { field_id: config.data.receiptFolioFieldId, field_value: message.paymentFolio },
        { field_id: config.data.receiptAmountFieldId, field_value: message.amount },
        { field_id: config.data.receiptBalanceFieldId, field_value: message.balance },
      ],
    },
    operation: "guardar los datos del comprobante en ManyChat",
  });
  if (!fields.ok) {
    return { ok: false, message: fields.message };
  }

  const flow = await manyChatFetch<null>({
    config: config.data,
    path: "/fb/sending/sendFlow",
    method: "POST",
    body: { subscriber_id: subscriber.data, flow_ns: config.data.receiptFlowId },
    operation: "disparar el envío del comprobante por WhatsApp en ManyChat",
  });
  if (!flow.ok) {
    return { ok: false, message: flow.message };
  }

  return { ok: true };
}
