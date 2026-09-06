import { describe, expect, it, vi } from "vitest";

// Sprint-03 task 8: "a normal-role request to a catalog write endpoint is
// rejected even if made directly (e.g. via curl), not only blocked in the
// UI." There is no headless browser or a practical way to curl a Next.js
// Server Action directly (it requires the framework's own action-id
// header, generated at build time) in this environment, so this proves the
// same guarantee at the function level instead: `auth()` is mocked to
// return a `normal` (and separately, an unauthenticated) session, and every
// catalog write action is called directly — bypassing the UI entirely,
// exactly like an attacker hitting the endpoint would. Every action calls
// `requireRole(session, "super")` as its first line (matching the
// `usuarios` actions pattern from Sprint 2), so this must throw before any
// database access — no throwaway rows or cleanup needed.
// `vi.hoisted` so `mockAuth` is created alongside the hoisted `vi.mock`
// call below, rather than after it (a plain `const` here would still throw
// "Cannot access before initialization" since `vi.mock` is hoisted above
// it). Referencing this directly (rather than `vi.mocked(auth)`) also
// sidesteps a real type wrinkle: next-auth v5's `auth` export is overloaded
// (plain session getter vs. middleware signature), which `vi.mocked()`
// resolves ambiguously against `mockResolvedValue`.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

import { ForbiddenError, UnauthorizedError } from "@/lib/authorization";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/app/categorias/actions";
import {
  createService,
  deleteService,
  updateService,
} from "@/app/servicios/actions";
import {
  createPriceList,
  deletePriceList,
  setPriceListActive,
  setPriceListDefault,
  updatePriceList,
} from "@/app/listas-precios/actions";
import {
  createPackage,
  deletePackage,
  savePackagePrice,
  setPackageActive,
  setPackageServices,
  updatePackage,
} from "@/app/paquetes/actions";

const DUMMY_ID = "00000000-0000-0000-0000-000000000000";

const normalSession = {
  user: { id: DUMMY_ID, role: "normal" as const, name: "Normal", email: "normal@example.com" },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

const catalogWriteActions: Record<string, () => Promise<unknown>> = {
  createCategory: () => createCategory({ name: "x" }),
  updateCategory: () => updateCategory({ id: DUMMY_ID, name: "x" }),
  deleteCategory: () => deleteCategory(DUMMY_ID),
  createService: () =>
    createService({
      name: "x",
      details: null,
      categoryId: DUMMY_ID,
      options: [],
    }),
  updateService: () =>
    updateService({
      id: DUMMY_ID,
      name: "x",
      details: null,
      categoryId: DUMMY_ID,
      options: [],
    }),
  deleteService: () => deleteService(DUMMY_ID),
  createPriceList: () => createPriceList({ name: "x" }),
  updatePriceList: () => updatePriceList({ id: DUMMY_ID, name: "x" }),
  setPriceListActive: () => setPriceListActive(DUMMY_ID, true),
  setPriceListDefault: () => setPriceListDefault(DUMMY_ID),
  deletePriceList: () => deletePriceList(DUMMY_ID),
  createPackage: () =>
    createPackage({
      name: "x",
      description: null,
      categoryId: DUMMY_ID,
      maxQuantity: null,
      quantityUnit: null,
    }),
  updatePackage: () =>
    updatePackage({
      id: DUMMY_ID,
      name: "x",
      description: null,
      categoryId: DUMMY_ID,
      maxQuantity: null,
      quantityUnit: null,
    }),
  setPackageActive: () => setPackageActive(DUMMY_ID, true),
  deletePackage: () => deletePackage(DUMMY_ID),
  setPackageServices: () => setPackageServices(DUMMY_ID, [DUMMY_ID]),
  savePackagePrice: () => savePackagePrice(DUMMY_ID, DUMMY_ID, 100),
};

describe("catalog write actions reject direct calls that bypass the UI", () => {
  it.each(Object.entries(catalogWriteActions))(
    "%s rejects a normal-role session with ForbiddenError",
    async (_name, action) => {
      mockAuth.mockResolvedValue(normalSession);
      await expect(action()).rejects.toBeInstanceOf(ForbiddenError);
    }
  );

  it.each(Object.entries(catalogWriteActions))(
    "%s rejects an unauthenticated request with UnauthorizedError",
    async (_name, action) => {
      mockAuth.mockResolvedValue(null);
      await expect(action()).rejects.toBeInstanceOf(UnauthorizedError);
    }
  );
});
