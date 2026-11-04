import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateReceiptImage } from "../generate-receipt-image";
import type { ReceiptSnapshot } from "../snapshot";

// payment-receipt visual QA: renders a typical receipt and a worst case (long
// client name, long note, settled contract) so the layout can be inspected by
// eye — the `Read` tool renders JPEGs. Re-run after touching the layout or
// RECEIPT_LOGO_SOURCE_RECT:
//   npx tsx src/lib/payment-receipt/qa/generate-receipt-samples.ts [outDir]
const DEFAULT_OUT_DIR = path.join(process.cwd(), "src/lib/payment-receipt/qa/samples");

const TYPICAL_RECEIPT: ReceiptSnapshot = {
  v: 1,
  issuedAt: "2026-11-02T18:30:00.000Z",
  paymentFolio: "PG-0007",
  contractFolio: "03142",
  clientName: "María López García",
  eventType: "quinceanera",
  eventDate: "2027-02-14",
  amountCents: 500_000,
  method: "bank_transfer",
  concept: "installment",
  paymentDate: "2026-11-01",
  note: "Depósito BBVA ref 1234",
  contractTotalCents: 2_000_000,
  totalPaidCents: 1_200_000,
  balanceCents: 800_000,
  paymentStatus: "partial",
  recordedByName: "Ana Pérez",
};

const WORST_CASE_RECEIPT: ReceiptSnapshot = {
  ...TYPICAL_RECEIPT,
  paymentFolio: "PG-9999",
  clientName:
    "María de los Ángeles Guadalupe Hernández Villarreal de la Garza y Montemayor Treviño",
  amountCents: 12_345_678,
  method: "card",
  concept: "settlement",
  note:
    "Liquidación pagada con tarjeta en dos exhibiciones; el cliente pidió factura a nombre de la empresa y entregará la constancia fiscal la próxima semana junto con el resto de los documentos solicitados.",
  contractTotalCents: 15_000_000,
  totalPaidCents: 15_000_000,
  balanceCents: 0,
  paymentStatus: "paid_in_full",
  recordedByName: "Francisco Javier Rodríguez Salinas",
};

async function main(): Promise<void> {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT_DIR;
  await mkdir(outDir, { recursive: true });
  const samples: [string, ReceiptSnapshot][] = [
    ["receipt-sample.jpg", TYPICAL_RECEIPT],
    ["receipt-worst-case.jpg", WORST_CASE_RECEIPT],
  ];
  for (const [name, snapshot] of samples) {
    const image = await generateReceiptImage(snapshot);
    await writeFile(path.join(outDir, name), image);
    console.log(`${name}: ${image.byteLength} bytes`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
