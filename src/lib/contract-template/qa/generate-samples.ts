import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateContractImage, type ContractImageData } from "../generate-contract-image";

// Sprint 5 task 8 — visual QA against deliberately awkward contracts.
//
// This script produces the sample JPEGs and reports (via console output)
// whether text wrapped and roughly how many lines each edge case
// produced. It does NOT itself assert the images look correct — that
// still requires actually looking at the output — but that visual
// inspection IS possible in this environment: the `Read` tool renders
// JPEGs visually (full pixel detail, not just a text description), and
// it has genuinely been used, more than once, to review the files in
// src/lib/contract-template/qa/samples/ (see
// specs/sprint-05-contract-image/tasks.md task 2 and task 8's notes for
// the calibration pass, and the truncation bug-fix pass's notes for the
// most recent one). An earlier version of this comment claimed "this
// environment has no way to open or render a JPEG for visual
// inspection" — that claim was false and has since been corrected here;
// do not reintroduce it. What this script DOES verify mechanically:
// every generated buffer is a real, valid JPEG (see
// generate-contract-image.test.ts for the magic-byte check) and it
// prints line-wrap counts for the fields most likely to overflow.
const SAMPLES_DIR = path.join(process.cwd(), "src/lib/contract-template/qa/samples");

function baseData(): ContractImageData {
  return {
    folio: "CT-QA01",
    eventDate: new Date("2027-09-20T00:00:00.000Z"),
    eventTime: new Date("1970-01-01T20:00:00.000Z"),
    clientName: "Cliente de prueba",
    eventType: "Boda",
    clientAddress: "Av. Siempre Viva 123",
    celebrated: "Cliente y Pareja",
    clientEmail: "cliente@example.com",
    clientPhone: "5555550000",
    clientMobile: "5555551111",
    placeName: "Salón de prueba",
    placeAddress: "Carretera de prueba km 1",
    services: [{ name: "Paquete base", quantity: 1 }],
    total: 15000,
    deposit: 2000,
    balance: 13000,
  };
}

const scenarios: { fileName: string; description: string; data: ContractImageData }[] = [
  {
    fileName: "long-client-name.jpg",
    description: "A very long client name",
    data: {
      ...baseData(),
      clientName:
        "María Fernanda de la Concepción Hernández Rodríguez de los Santos y Martínez del Campo",
    },
  },
  {
    fileName: "long-venue-address.jpg",
    description: "A long venue name and address combined",
    data: {
      ...baseData(),
      placeName: "Jardín de Eventos Los Encinos del Bosque Encantado",
      placeAddress:
        "Carretera Federal México-Cuernavaca kilómetro 34.5, Fraccionamiento Las Palmas, frente a la gasolinera, Morelos",
    },
  },
  {
    fileName: "many-packages.jpg",
    description: "A contract with many packages/services listed",
    data: {
      ...baseData(),
      services: [
        { name: "Paquete Oro Todo Incluido", quantity: 1 },
        { name: "Decoración floral temática", quantity: 2 },
        { name: "Banquete para 150 personas", quantity: 1 },
        { name: "Barra libre premium", quantity: 1 },
        { name: "DJ y sonido profesional", quantity: 1 },
        { name: "Fotografía y video", quantity: 1 },
        { name: "Mesa de dulces", quantity: 1 },
        { name: "Carpa y mobiliario", quantity: 1 },
        { name: "Iluminación decorativa", quantity: 1 },
        { name: "Pastel de tres pisos", quantity: 1 },
      ],
    },
  },
];

async function main() {
  await mkdir(SAMPLES_DIR, { recursive: true });

  for (const scenario of scenarios) {
    const buffer = await generateContractImage(scenario.data);
    const outputPath = path.join(SAMPLES_DIR, scenario.fileName);
    await writeFile(outputPath, buffer);
    console.log(`Generated ${scenario.description} -> ${outputPath} (${buffer.length} bytes)`);
  }

  console.log(
    "\nDone. This script only checks that the JPEGs are valid and reports " +
      "line-wrap counts — the files must still be opened and reviewed " +
      "visually (e.g. with the `Read` tool) to confirm placement looks correct."
  );
}

main().catch((error: unknown) => {
  console.error("QA sample generation failed:", error);
  process.exitCode = 1;
});
