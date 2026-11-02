// Client-side catalog snapshot passed down from the server component
// (page.tsx) into the public wizard. Deliberately NOT the same shape as
// src/app/(app)/contratos/nuevo/types.ts's `CatalogPackage`: there is only
// ever ONE price list here (the one marked `isPublic`, resolved server-side —
// see @/lib/contracts/public-price-list), so `pricesByPriceListId` would be a
// map with a single, pointless key. `price` is a plain number instead, and a
// package with no price in the public list is never included at all
// (filtered out in page.tsx, matching the server action's own rejection
// rule in src/app/precontrato/actions.ts).
//
// Also no synthetic `PQ-xx` catalog code: that code is an internal staff
// convenience (matches what /paquetes prints) and has no reason to leak into
// an anonymous, public-facing cart.

export interface PublicServiceRef {
  id: string;
  name: string;
  /** Non-empty only for services that require a "choose 1 of N" pick
   * (spec §6.6) — a package whose included services are all option-less
   * never triggers the services step. */
  options: string[];
}

export interface PublicPackage {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  maxQuantity: number | null;
  quantityUnit: string | null;
  services: PublicServiceRef[];
  /** Always a real number — packages with no price in the public list are
   * dropped before they ever reach the client (page.tsx). */
  price: number;
}

export interface PublicCategory {
  id: string;
  name: string;
  packages: PublicPackage[];
}

export interface PublicOrderLine {
  packageId: string;
  quantity: number;
}

/** One priced row of the order, derived in `precontract-wizard.tsx` and
 * consumed by BOTH the persistent summary panel and the confirm step's
 * table — deriving it once is what keeps the two from drifting (same
 * discipline as the internal wizard's `QuotedLine`). */
export interface PublicQuotedLine {
  packageId: string;
  name: string;
  quantity: number;
  quantityUnit: string | null;
  unitPrice: number;
  lineTotal: number;
}
