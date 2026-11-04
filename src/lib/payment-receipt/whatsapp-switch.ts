// TODO: WhatsApp/ManyChat delivery of receipts is PAUSED by product decision
// (2026-11-03, it will change later). To re-enable, flip this to `true` and set
// the MANYCHAT_RECEIPT_* env vars. Everything else (ManyChat receipt module,
// `receipt_whatsapp_sent`, the public /comprobantes/view route) is kept intact.
//
// Kept in its own dependency-free file so client components can import it
// without pulling Prisma/Resend in through delivery.ts.
export const RECEIPT_WHATSAPP_ENABLED = false;
