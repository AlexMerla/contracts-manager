// Client-side catalog snapshot passed down from the server component
// (page.tsx) into the wizard. Not to be confused with the `contract_packages`
// snapshot (spec §6.5) written at confirm time — this one only exists to
// avoid re-fetching the catalog on every wizard step.

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
  name: string;
  description: string | null;
  categoryId: string;
  maxQuantity: number | null;
  quantityUnit: string | null;
  services: CatalogServiceRef[];
  /** Resolved price per price list id — a package with no row in
   * `package_prices` for a given list is simply absent from this map. */
  pricesByPriceListId: Record<string, number>;
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
}

export interface OrderLine {
  packageId: string;
  quantity: number;
}

export interface ContractDataValues {
  clientName: string;
  clientPhone: string;
  clientMobile: string;
  clientEmail: string;
  clientAddress: string;
  eventType: string;
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
