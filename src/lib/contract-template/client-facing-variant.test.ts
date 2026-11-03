import { describe, expect, it } from "vitest";

import {
  clientFacingImage,
  clientFacingImageFileName,
} from "@/lib/contract-template/client-facing-variant";

describe("clientFacingImage", () => {
  it("serves the pre-contract while the contract is still pre_contract", () => {
    expect(clientFacingImage("pre_contract")).toEqual({
      variant: "pre-contract",
      label: "Precontrato",
    });
  });

  it("serves the official contract once confirmed", () => {
    expect(clientFacingImage("confirmed")).toEqual({
      variant: "contract",
      label: "Contrato",
    });
  });

  it("keeps serving the official contract once completed", () => {
    expect(clientFacingImage("completed")).toEqual({
      variant: "contract",
      label: "Contrato",
    });
  });

  it("serves nothing for a cancelled contract", () => {
    expect(clientFacingImage("cancelled")).toBeNull();
  });
});

describe("clientFacingImageFileName", () => {
  it("prefixes the folio with the status label", () => {
    expect(
      clientFacingImageFileName({ variant: "pre-contract", label: "Precontrato" }, "03142")
    ).toBe("Precontrato03142.jpg");
    expect(clientFacingImageFileName({ variant: "contract", label: "Contrato" }, "03142")).toBe(
      "Contrato03142.jpg"
    );
  });
});
