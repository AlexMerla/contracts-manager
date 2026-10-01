import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appBaseUrl,
  contractViewerPath,
  contractViewerUrl,
  tryContractViewerUrl,
} from "@/lib/app-url";

const original = process.env.APP_BASE_URL;

function setBaseUrl(value: string | undefined) {
  // `process.env.X = undefined` coerces to the string "undefined" — same
  // hazard already documented in src/lib/google/encryption.test.ts.
  if (value === undefined) {
    delete process.env.APP_BASE_URL;
  } else {
    process.env.APP_BASE_URL = value;
  }
}

beforeEach(() => setBaseUrl(undefined));
afterEach(() => setBaseUrl(original));

describe("appBaseUrl", () => {
  it("throws a configuration message when APP_BASE_URL is missing or blank", () => {
    expect(() => appBaseUrl()).toThrow(/APP_BASE_URL no está configurada/);
    setBaseUrl("   ");
    expect(() => appBaseUrl()).toThrow(/APP_BASE_URL no está configurada/);
  });

  it("throws when the value is not an absolute URL", () => {
    setBaseUrl("contratos.ejemplo.com");
    expect(() => appBaseUrl()).toThrow(/no es una URL válida/);
  });

  it("rejects a non-http(s) scheme", () => {
    setBaseUrl("ftp://contratos.ejemplo.com");
    expect(() => appBaseUrl()).toThrow(/http:\/\/ o https:\/\//);
  });

  it("normalises away a trailing slash, a path and the default port", () => {
    setBaseUrl("https://contratos.ejemplo.com/");
    expect(appBaseUrl()).toBe("https://contratos.ejemplo.com");
    setBaseUrl("https://contratos.ejemplo.com:443/algo/mas");
    expect(appBaseUrl()).toBe("https://contratos.ejemplo.com");
    setBaseUrl("http://localhost:3000");
    expect(appBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("contractViewerPath / contractViewerUrl", () => {
  it("builds the §10 route from the viewer token", () => {
    expect(contractViewerPath("abc-123")).toBe("/contracts/view/abc-123");
  });

  it("percent-encodes a token that would otherwise alter the path", () => {
    expect(contractViewerPath("a/b?c")).toBe("/contracts/view/a%2Fb%3Fc");
  });

  it("joins origin and path without a double slash", () => {
    setBaseUrl("https://contratos.ejemplo.com/");
    expect(contractViewerUrl("tok")).toBe("https://contratos.ejemplo.com/contracts/view/tok");
  });

  it("tryContractViewerUrl returns null instead of throwing when unconfigured", () => {
    expect(tryContractViewerUrl("tok")).toBeNull();
    setBaseUrl("https://contratos.ejemplo.com");
    expect(tryContractViewerUrl("tok")).toBe("https://contratos.ejemplo.com/contracts/view/tok");
  });
});
