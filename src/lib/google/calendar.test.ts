import { describe, expect, it } from "vitest";

import {
  EVENT_TIME_ZONE,
  buildCalendarPackages,
  buildContractCalendarEvent,
  type CalendarPackageRow,
  type CalendarSelectionRow,
  type ContractCalendarSource,
} from "@/lib/google/calendar";

// Only the pure event-body builder is covered here. The upsert itself needs a
// live Google Calendar (see the design's testing notes).
const base: ContractCalendarSource = {
  folio: "A-0042",
  clientName: "María López",
  eventType: "quinceanera",
  contractStatus: "confirmed",
  eventDate: new Date("2026-11-14T00:00:00.000Z"),
  eventTime: new Date("1970-01-01T20:30:00.000Z"),
  celebrated: "Sofía",
  placeName: "Salón Jardín",
  placeAddress: "Av. Reforma 100",
  clientPhone: "5551234567",
  clientMobile: "5559876543",
  clientAddress: "Calle Falsa 123",
  clientEmail: "maria@example.com",
  packages: [
    { name: "Paquete Oro", quantity: 2, category: "Música", options: ["DJ: Cabina LED"] },
    { name: "Decoración floral", quantity: 1, category: null, options: [] },
  ],
  driveFileId: "drive-file-1",
  preContractDriveFileId: "drive-file-2",
};

describe("buildContractCalendarEvent", () => {
  it("builds a timed event in the Mexico City zone with the default duration", () => {
    const event = buildContractCalendarEvent(base);

    expect(event.summary).toBe("XV años — María López (A-0042)");
    expect(event.location).toBe("Salón Jardín - Av. Reforma 100");
    expect(event.start).toEqual({ dateTime: "2026-11-14T20:30:00", timeZone: EVENT_TIME_ZONE });
    expect(event.end).toEqual({ dateTime: "2026-11-15T00:30:00", timeZone: EVENT_TIME_ZONE });
  });

  // Resolved Q4 (contract-cancellation): the event is RETITLED, never
  // deleted, and nothing else about the body changes — the operator still
  // needs the client's contact details to settle a cancellation.
  it("prefixes the summary with [CANCELADO] for a cancelled contract and leaves the body intact", () => {
    const event = buildContractCalendarEvent({ ...base, contractStatus: "cancelled" });

    expect(event.summary).toBe("[CANCELADO] XV años — María López (A-0042)");
    expect(event.description).toBe(buildContractCalendarEvent(base).description);
    expect(event.location).toBe("Salón Jardín - Av. Reforma 100");
  });

  it("builds an all-day event with an exclusive end date when no time is recorded", () => {
    const event = buildContractCalendarEvent({ ...base, eventTime: null });

    expect(event.start).toEqual({ date: "2026-11-14" });
    expect(event.end).toEqual({ date: "2026-11-15" });
  });

  it("omits location entirely when the contract has no venue", () => {
    const event = buildContractCalendarEvent({ ...base, placeName: null, placeAddress: null });

    expect(event.location).toBeUndefined();
  });

  it("uses whichever venue field is present", () => {
    expect(buildContractCalendarEvent({ ...base, placeAddress: null }).location).toBe(
      "Salón Jardín"
    );
    expect(buildContractCalendarEvent({ ...base, placeName: null }).location).toBe(
      "Av. Reforma 100"
    );
  });

  it("renders the full structured description exactly", () => {
    const event = buildContractCalendarEvent(base);

    expect(event.description).toBe(
      [
        "👤 CLIENTE:",
        "- Nombre: María López",
        "- Dirección: Calle Falsa 123",
        "- Correo: maria@example.com",
        "- Teléfono: 5551234567",
        "- Celular/Whatsapp: 5559876543",
        "",
        "📌 LUGAR DEL EVENTO:",
        "- Nombre: Salón Jardín",
        "- Dirección: Av. Reforma 100",
        "",
        "🎉 FESTEJADOS:",
        "- Nombres: Sofía",
        "",
        "📦 SERVICIOS:",
        "- Paquete Oro(x2) [Música] + DJ: Cabina LED",
        "- Decoración floral(x1)",
        "",
        "FOLIO: A-0042",
        "",
        "📎 ARCHIVOS:",
        "- Contrato: https://drive.google.com/file/d/drive-file-1/view",
        "- Precontrato: https://drive.google.com/file/d/drive-file-2/view",
      ].join("\n")
    );
  });

  it("lists only the contract link when the pre-contract has no Drive file yet", () => {
    const event = buildContractCalendarEvent({ ...base, preContractDriveFileId: null });

    expect(event.description).toContain(
      "📎 ARCHIVOS:\n- Contrato: https://drive.google.com/file/d/drive-file-1/view"
    );
    expect(event.description).not.toContain("Precontrato");
  });

  it("lists only the pre-contract link when the official contract has no Drive file yet", () => {
    const event = buildContractCalendarEvent({ ...base, driveFileId: null });

    expect(event.description).toContain(
      "📎 ARCHIVOS:\n- Precontrato: https://drive.google.com/file/d/drive-file-2/view"
    );
    expect(event.description).not.toContain("- Contrato:");
  });

  it("omits the ARCHIVOS section entirely when neither Drive file exists yet", () => {
    const event = buildContractCalendarEvent({
      ...base,
      driveFileId: null,
      preContractDriveFileId: null,
    });

    expect(event.description).not.toContain("📎 ARCHIVOS");
    expect(event.description.endsWith("FOLIO: A-0042")).toBe(true);
  });

  it("drops a whole section when every field in it is empty", () => {
    const event = buildContractCalendarEvent({ ...base, celebrated: null });

    expect(event.description).not.toContain("🎉 FESTEJADOS");
  });

  it("drops individual empty lines within a section but keeps the rest", () => {
    const event = buildContractCalendarEvent({
      ...base,
      clientAddress: null,
      clientEmail: null,
      clientPhone: null,
      clientMobile: null,
    });

    expect(event.description).toContain("👤 CLIENTE:\n- Nombre: María López");
    expect(event.description).not.toContain("- Dirección: Calle Falsa");
    expect(event.description).not.toContain("- Correo");
    expect(event.description).not.toContain("- Teléfono");
    expect(event.description).not.toContain("- Celular/Whatsapp");
  });

  it("drops the packages section entirely when there are no packages", () => {
    const event = buildContractCalendarEvent({ ...base, packages: [] });

    expect(event.description).not.toContain("📦 SERVICIOS");
  });
});

describe("buildCalendarPackages", () => {
  const rows: CalendarPackageRow[] = [
    {
      nameSnapshot: "Paquete Oro",
      quantity: 2,
      package: {
        category: { name: "Música" },
        packageServices: [{ serviceId: "svc-dj", service: { name: "DJ" } }],
      },
    },
    {
      nameSnapshot: "Decoración floral",
      quantity: 1,
      package: {
        category: null,
        packageServices: [],
      },
    },
  ];

  it("attaches a selected option to the package that offers that service", () => {
    const selections: CalendarSelectionRow[] = [{ serviceId: "svc-dj", selectedOption: "Cabina LED" }];

    const packages = buildCalendarPackages(rows, selections);

    expect(packages[0]).toEqual({
      name: "Paquete Oro",
      quantity: 2,
      category: "Música",
      options: ["DJ: Cabina LED"],
    });
    expect(packages[1]).toEqual({
      name: "Decoración floral",
      quantity: 1,
      category: null,
      options: [],
    });
  });

  it("leaves options empty when a package's service has no recorded selection", () => {
    const packages = buildCalendarPackages(rows, []);

    expect(packages[0].options).toEqual([]);
  });

  it("duplicates a shared service's selection under every package that offers it", () => {
    const sharedRows: CalendarPackageRow[] = [
      {
        nameSnapshot: "Paquete A",
        quantity: 1,
        package: {
          category: null,
          packageServices: [{ serviceId: "svc-shared", service: { name: "Fotografía" } }],
        },
      },
      {
        nameSnapshot: "Paquete B",
        quantity: 1,
        package: {
          category: null,
          packageServices: [{ serviceId: "svc-shared", service: { name: "Fotografía" } }],
        },
      },
    ];
    const selections: CalendarSelectionRow[] = [
      { serviceId: "svc-shared", selectedOption: "Paquete premium" },
    ];

    const packages = buildCalendarPackages(sharedRows, selections);

    expect(packages[0].options).toEqual(["Fotografía: Paquete premium"]);
    expect(packages[1].options).toEqual(["Fotografía: Paquete premium"]);
  });
});
