// Client-side catalog snapshot passed down from the server component
// (page.tsx) into the wizard. Not to be confused with the `contract_packages`
// snapshot (spec §6.5) written at confirm time — this one only exists to
// avoid re-fetching the catalog on every wizard step.

import type { EventType } from "@/generated/prisma/client";

export interface CatalogServiceRef {
  id: string;
  name: string;
  /** Non-empty only for services that require a "choose 1 of N" pick
   * (spec §6.6) — a package whose included services are all option-less
   * never triggers step 3. */
  options: string[];
}

export interface CatalogPackage {
  id: string;
  /** Synthetic `PQ-xx` display code, ranked by `createdAt` over EVERY
   * package (not just the active ones this wizard shows) so it matches the
   * code `/paquetes` prints for the same package. Display only — never sent
   * to the server, never stored. */
  code: string;
  name: string;
  description: string | null;
  categoryId: string;
  /** Denormalized so step 2 can render a flat grid with a category filter
   * without walking back up to `CatalogCategory`. */
  categoryName: string;
  maxQuantity: number | null;
  quantityUnit: string | null;
  services: CatalogServiceRef[];
  /** Resolved price per price list id — a package with no row in
   * `package_prices` for a given list is simply absent from this map. */
  pricesByPriceListId: Record<string, number>;
  /** edit-precontract: a line the contract already has. Its entry in
   * `pricesByPriceListId` for the contract's list is the `price_snapshot`, not
   * the live price (spec §6.5) — the server prices it the same way. */
  priceLocked?: boolean;
}

export interface CatalogCategory {
  id: string;
  name: string;
  packages: CatalogPackage[];
}

export interface CatalogPriceList {
  id: string;
  name: string;
  isDefault: boolean;
  /** `_count.contracts` — how many contracts already use this list. Shown on
   * the step 1 cards so the user can tell the working list from a dormant
   * one at a glance. */
  contractCount: number;
}

export interface OrderLine {
  packageId: string;
  quantity: number;
}

/** One priced row of the order, derived in `contract-wizard.tsx` and consumed
 * by BOTH the persistent summary panel and step 5's "Servicios cotizados"
 * table — deriving it once is what keeps the two from drifting. */
export interface QuotedLine {
  packageId: string;
  code: string;
  name: string;
  quantity: number;
  quantityUnit: string | null;
  unitPrice: number;
  lineTotal: number;
}

export interface ContractDataValues {
  clientName: string;
  clientPhone: string;
  clientMobile: string;
  clientEmail: string;
  clientAddress: string;
  eventType: EventType;
  celebrated: string;
  eventDate: string;
  eventTime: string;
  placeName: string;
  placeAddress: string;
}

export interface AmountsValues {
  discount: number | null;
  extraCharge: number | null;
  deposit: number;
}

/** edit-precontract (spec §8.2) — everything the wizard needs to open on an
 * existing contract instead of a blank order. Built by
 * `/contratos/[id]/editar` from the contract's OWN rows. */
export interface WizardEditMode {
  contractId: string;
  orderLines: OrderLine[];
  /** serviceId → option, already filtered to options that are still live. */
  serviceSelections: Record<string, string>;
  contractData: ContractDataValues;
  discount: number | null;
  extraCharge: number | null;
  deposit: number;
  /** `paymentStatus !== "pending"` — the deposit was already collected. */
  depositLocked: boolean;
  /** Live SUM of payments; the new total may not go below it. */
  totalPaid: number;
}
