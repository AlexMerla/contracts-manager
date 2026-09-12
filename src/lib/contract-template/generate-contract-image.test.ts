import { describe, expect, it } from "vitest";

import { generateContractImage, type ContractImageData } from "./generate-contract-image";

// JPEG files start with the SOI marker 0xFFD8 followed by 0xFF (the first
// marker segment, typically APP0/JFIF or APP1/Exif) — checking these three
// bytes is a standard "is this really a JPEG" sanity check without needing
// a full decoder.
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

function sampleContractData(): ContractImageData {
  return {
    folio: "CT-0001",
    eventDate: new Date("2027-06-15T00:00:00.000Z"),
    eventTime: new Date("1970-01-01T18:30:00.000Z"),
    clientName: "María Fernández López",
    eventType: "Boda",
    clientAddress: "Av. Reforma 123, CDMX",
    celebrated: "María y Juan",
    clientEmail: "maria@example.com",
    clientPhone: "5555551234",
    clientMobile: "5555555678",
    placeName: "Salón Jardines del Sol",
    placeAddress: "Carretera Federal km 12",
    services: [
      { name: "Paquete Oro", quantity: 1 },
      { name: "Decoración floral", quantity: 2 },
    ],
    total: 25000,
    deposit: 3000,
    balance: 22000,
  };
}

// Spec §7 / sprint-05 task 5: "calling the function with a sample
// contract's data returns a valid JPEG ... with all fields correctly
// placed." This test proves the function produces a real, non-corrupt
// JPEG buffer of a reasonable size — it is NOT a visual-diff test, so it
// can't catch a coordinate being visually wrong by itself. Actual visual
// placement (correct two-column layout, no overlaps, accents rendering
// correctly) was verified separately by regenerating the samples in
// qa/samples/ and inspecting them with the `Read` tool — see
// specs/sprint-05-contract-image/tasks.md task 8.
describe("generateContractImage", () => {
  it("returns a valid JPEG buffer for a normal contract", async () => {
    const buffer = await generateContractImage(sampleContractData());

    expect(buffer.subarray(0, 3).equals(JPEG_MAGIC)).toBe(true);
    // The unmodified template alone is ~220KB; a real image with text
    // drawn on it should be at least in that ballpark, not a truncated
    // near-empty file.
    expect(buffer.length).toBeGreaterThan(50_000);
  });

  it("handles null/empty optional fields without throwing", async () => {
    const data: ContractImageData = {
      ...sampleContractData(),
      clientAddress: null,
      celebrated: null,
      clientEmail: null,
      clientPhone: null,
      clientMobile: null,
      placeName: null,
      placeAddress: null,
      eventTime: null,
      services: [],
    };

    const buffer = await generateContractImage(data);

    expect(buffer.subarray(0, 3).equals(JPEG_MAGIC)).toBe(true);
  });

  it("produces a differently-sized (or at least valid) image for a contract with a very long service list", async () => {
    const data: ContractImageData = {
      ...sampleContractData(),
      services: Array.from({ length: 20 }, (_, index) => ({
        name: `Servicio adicional número ${index + 1} con descripción larga`,
        quantity: 1,
      })),
    };

    const buffer = await generateContractImage(data);

    expect(buffer.subarray(0, 3).equals(JPEG_MAGIC)).toBe(true);
  });
});
