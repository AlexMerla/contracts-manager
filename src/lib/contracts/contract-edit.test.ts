import { describe, expect, it } from "vitest";

import {
  CONTRACT_EDIT_BLOCK_MESSAGE,
  contractEditBlock,
  describeContractEditChanges,
  toCentsOrNull,
  type EditableContractState,
} from "./contract-edit";

function baseState(): EditableContractState {
  return {
    clientName: "Ana",
    clientPhone: "5551112222",
    clientMobile: "5553334444",
    clientEmail: "ana@example.com",
    clientAddress: null,
    eventType: "wedding",
    celebrated: null,
    eventDate: "2027-06-15",
    eventTime: null,
    placeName: null,
    placeAddress: null,
    lines: { a: 1, b: 2 },
    selections: { s1: "Rojo" },
    discountCents: null,
    extraChargeCents: null,
    depositCents: 100000,
  };
}

describe("contractEditBlock", () => {
  it("allows pre_contract and confirmed while not paid in full", () => {
    expect(contractEditBlock("pre_contract", "pending")).toBeNull();
    expect(contractEditBlock("confirmed", "partial")).toBeNull();
    expect(contractEditBlock("confirmed", "deposit_paid")).toBeNull();
  });

  it("refuses paid_in_full and closed contracts with their own copy", () => {
    expect(contractEditBlock("confirmed", "paid_in_full")).toBe("paid_in_full");
    expect(contractEditBlock("completed", "partial")).toBe("closed");
    expect(contractEditBlock("cancelled", "pending")).toBe("closed");
    // Closed wins over paid in full.
    expect(contractEditBlock("completed", "paid_in_full")).toBe("closed");
    expect(CONTRACT_EDIT_BLOCK_MESSAGE.paid_in_full).toBe(
      "Este contrato ya está liquidado y no se puede editar."
    );
  });
});

describe("describeContractEditChanges", () => {
  it("returns nothing for an identical state", () => {
    expect(describeContractEditChanges(baseState(), baseState())).toEqual([]);
  });

  it("lists phone and deposit as 'teléfono, anticipo' (spec S11.1)", () => {
    const after = { ...baseState(), clientPhone: "5550000000", depositCents: 50000 };
    expect(describeContractEditChanges(baseState(), after)).toEqual(["teléfono", "anticipo"]);
  });

  it("distinguishes added/removed packages from quantity changes", () => {
    expect(describeContractEditChanges(baseState(), { ...baseState(), lines: { a: 1 } })).toEqual([
      "paquetes",
    ]);
    expect(describeContractEditChanges(baseState(), { ...baseState(), lines: { a: 1, b: 3 } })).toEqual([
      "cantidades",
    ]);
    expect(
      describeContractEditChanges(baseState(), { ...baseState(), lines: { a: 2, c: 1 } })
    ).toEqual(["paquetes", "cantidades"]);
  });

  it("reports service selections, discount and extra charge", () => {
    const after = {
      ...baseState(),
      selections: { s1: "Azul" },
      discountCents: 0,
      extraChargeCents: 1500,
    };
    expect(describeContractEditChanges(baseState(), after)).toEqual([
      "opciones de servicio",
      "descuento",
      "cargo extra",
    ]);
  });
});

describe("toCentsOrNull", () => {
  it("keeps null distinct from zero and rounds to cents", () => {
    expect(toCentsOrNull(null)).toBeNull();
    expect(toCentsOrNull(0)).toBe(0);
    expect(toCentsOrNull(0.1 + 0.2)).toBe(30);
  });
});
