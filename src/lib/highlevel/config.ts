// highlevel-whatsapp — env configuration, all-or-nothing PER FLOW: the shared
// token + location plus that flow's workflow id. A receipt workflow left unset
// must not stop contract WhatsApp, and vice versa.
//
// The custom field KEYS are code constants (src/lib/whatsapp/highlevel-whatsapp.ts),
// not env vars: the business created the fields with these exact names, and
// HighLevel accepts the key itself (verified live 2026-11-05).

export type HighLevelFlow = "contract" | "receipt";

const WORKFLOW_ENV: Record<HighLevelFlow, string> = {
  contract: "HIGHLEVEL_CONTRACT_WORKFLOW_ID",
  receipt: "HIGHLEVEL_RECEIPT_WORKFLOW_ID",
};

export interface HighLevelFlowConfig {
  token: string;
  locationId: string;
  workflowId: string;
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** `null` when any of the three values is missing or blank. */
export function readHighLevelConfig(flow: HighLevelFlow): HighLevelFlowConfig | null {
  const token = env("HIGHLEVEL_PIT_TOKEN");
  const locationId = env("HIGHLEVEL_LOCATION_ID");
  const workflowId = env(WORKFLOW_ENV[flow]);
  if (!token || !locationId || !workflowId) {
    return null;
  }
  return { token, locationId, workflowId };
}
