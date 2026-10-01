import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DeliveryStatus,
  hasPendingDelivery,
  pendingDeliverySteps,
  type DeliverySteps,
} from "@/components/delivery-status";

// Hardcoded expected labels (not imported from the module under test) so this
// test actually locks in the real Spanish copy — same discipline as
// status-pill.test.tsx.
const IMAGE_LABEL = "Imagen del contrato";
const DRIVE_LABEL = "Respaldo en Drive";
const CALENDAR_LABEL = "Evento en Calendar";
const EMAIL_LABEL = "Correo al cliente";

const COMPLETE: DeliverySteps = {
  imageGenerated: true,
  driveUploaded: true,
  calendarCreated: true,
  emailSent: true,
  hasClientEmail: true,
};

describe("pendingDeliverySteps / hasPendingDelivery (spec §4.2 point 4)", () => {
  it("returns an empty array and false when nothing is pending", () => {
    expect(pendingDeliverySteps(COMPLETE)).toEqual([]);
    expect(hasPendingDelivery(COMPLETE)).toBe(false);
  });

  it("returns labels in pipeline order (image → Drive → Calendar → correo) regardless of which flags are false", () => {
    const steps: DeliverySteps = {
      ...COMPLETE,
      imageGenerated: false,
      calendarCreated: false,
    };
    expect(pendingDeliverySteps(steps)).toEqual([IMAGE_LABEL, CALENDAR_LABEL]);
    expect(hasPendingDelivery(steps)).toBe(true);
  });

  it("returns all four labels when every step is pending", () => {
    const steps: DeliverySteps = {
      imageGenerated: false,
      driveUploaded: false,
      calendarCreated: false,
      emailSent: false,
      hasClientEmail: true,
    };
    expect(pendingDeliverySteps(steps)).toEqual([
      IMAGE_LABEL,
      DRIVE_LABEL,
      CALENDAR_LABEL,
      EMAIL_LABEL,
    ]);
    expect(hasPendingDelivery(steps)).toBe(true);
  });

  it("returns just one label when only a single flag is false", () => {
    const steps: DeliverySteps = { ...COMPLETE, driveUploaded: false };
    expect(pendingDeliverySteps(steps)).toEqual([DRIVE_LABEL]);
    expect(hasPendingDelivery(steps)).toBe(true);
  });

  // Sprint 7 task 7: `client_email` is nullable (spec §6.4). A contract with
  // no address has no email step — not a permanently-failing one.
  it("omits the email step entirely when the contract has no client email", () => {
    const steps: DeliverySteps = { ...COMPLETE, emailSent: false, hasClientEmail: false };
    expect(pendingDeliverySteps(steps)).toEqual([]);
    expect(hasPendingDelivery(steps)).toBe(false);
  });

  it("still reports the other steps for a contract with no client email", () => {
    const steps: DeliverySteps = {
      ...COMPLETE,
      driveUploaded: false,
      emailSent: false,
      hasClientEmail: false,
    };
    expect(pendingDeliverySteps(steps)).toEqual([DRIVE_LABEL]);
  });
});

describe("DeliveryStatus", () => {
  it("renders no badge (sr-only 'Entrega completa') when every step is complete", () => {
    const html = renderToStaticMarkup(<DeliveryStatus {...COMPLETE} />);
    expect(html).toContain("sr-only");
    expect(html).toContain("Entrega completa");
    expect(html).not.toContain("Falta");
  });

  it("renders singular copy 'Falta 1 paso' when exactly one step is pending", () => {
    const steps: DeliverySteps = { ...COMPLETE, driveUploaded: false };
    const html = renderToStaticMarkup(<DeliveryStatus {...steps} />);
    expect(html).toContain("Falta 1 paso");
    expect(html).not.toContain("Faltan");
  });

  it("renders plural copy 'Faltan 2 pasos' when two steps are pending", () => {
    const steps: DeliverySteps = { ...COMPLETE, imageGenerated: false, emailSent: false };
    const html = renderToStaticMarkup(<DeliveryStatus {...steps} />);
    expect(html).toContain("Faltan 2 pasos");
  });

  it("counts a pending email as a step", () => {
    const steps: DeliverySteps = { ...COMPLETE, emailSent: false };
    const html = renderToStaticMarkup(<DeliveryStatus {...steps} />);
    expect(html).toContain("Falta 1 paso");
  });
});
