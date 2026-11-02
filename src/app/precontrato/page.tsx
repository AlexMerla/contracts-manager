import type { Metadata } from "next";
import { Gift } from "lucide-react";

import { getPublicPriceList } from "@/lib/contracts/public-price-list";
import { getDepositThresholds } from "@/lib/deposit-config";
import { prisma } from "@/lib/prisma";
import { isPublicPreContractEnabled } from "@/lib/public-precontract";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

import { PrecontractWizard } from "./precontract-wizard";
import { PrecontratoUnavailable } from "./unavailable";
import type { PublicCategory } from "./types";

// Spec §8.1 / §10 — the public pre-contract flow. `/precontrato` is FINAL,
// not a placeholder (confirmed by the user alongside the marketing-landing
// decision). Same isolation precedent as the read-only viewer
// (`src/app/contracts/view/[viewerToken]/page.tsx`): `force-dynamic`,
// `noindex` (this is a direct-link/QR funnel, not meant to be organically
// discovered), and registered in `src/proxy.ts`'s `PUBLIC_PREFIXES` —
// without that, the edge guard redirects every anonymous visitor to
// `/login` before this ever renders.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arme su pedido | Todo con un Solo Proveedor",
  robots: { index: false, follow: false },
};

// Both the kill switches from @/lib/public-precontract's own docs land here:
// the env flag, and (independently) whether a `PriceList` is marked
// "pública". Either absence renders the SAME calm "no disponible" state —
// an anonymous visitor has no way to tell which one it was, which is the
// point (no internal configuration detail leaks through this page).
export default async function PrecontratoPage() {
  if (!isPublicPreContractEnabled()) {
    return <PrecontratoUnavailable />;
  }

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (!turnstileSiteKey) {
    console.error(
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY no está configurada — el flujo público de precontrato queda inactivo."
    );
    return <PrecontratoUnavailable />;
  }

  const priceList = await getPublicPriceList();
  if (!priceList) {
    return <PrecontratoUnavailable />;
  }

  const rawCategories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: {
      packages: {
        where: { active: true },
        orderBy: { name: "asc" },
        include: {
          packageServices: { include: { service: true } },
          packagePrices: { where: { priceListId: priceList.id } },
        },
      },
    },
  });

  const categories: PublicCategory[] = rawCategories
    .map((category) => ({
      id: category.id,
      name: category.name,
      packages: category.packages
        // Skip packages with no price in the public list — otherwise this
        // page would offer something ./actions.ts then rejects (its own
        // "price presence" gate), the same rule page.tsx's internal-wizard
        // counterpart follows for its own price list.
        .filter((pkg) => pkg.packagePrices[0]?.price != null)
        .map((pkg) => ({
          id: pkg.id,
          name: pkg.name,
          description: pkg.description,
          categoryId: pkg.categoryId,
          categoryName: category.name,
          maxQuantity: pkg.maxQuantity,
          quantityUnit: pkg.quantityUnit,
          services: pkg.packageServices.map(({ service }) => ({
            id: service.id,
            name: service.name,
            options: Array.isArray(service.options) ? (service.options as string[]) : [],
          })),
          price: Number(pkg.packagePrices[0]?.price),
        })),
    }))
    .filter((category) => category.packages.length > 0);

  if (categories.length === 0) {
    return <PrecontratoUnavailable />;
  }

  const depositThresholds = getDepositThresholds();

  return (
    <main className="flex flex-1 flex-col">
      {/* Marketing-style hero, added ABOVE the step flow per the late
          design amendment — presentational only, does not touch the
          cart/form step mechanics below. First use anywhere in this
          codebase of the `brand` surface/button combination
          (docs/design-system.md §1.1/§2: "wordmark, links, and
          onboarding/marketing surfaces only"). */}
      <section className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-5 py-12 sm:px-7 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-col gap-4">
            <p className="font-heading text-sm font-medium tracking-wide text-[var(--brand-700)] uppercase">
              Todo con un Solo Proveedor
            </p>
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              Arme su paquete y reciba su precontrato en minutos
            </h1>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
              Elija los paquetes y servicios para su evento, complete sus
              datos y confirme — nosotros nos encargamos del resto.
            </p>
            <div>
              <Button variant="brand" size="lg" render={<a href="#precontrato-wizard" />}>
                Comenzar
              </Button>
            </div>
          </div>

          {/* Hero image placeholder per the design amendment — a tasteful
              brand-tinted panel, never an illustration or emoji
              (docs/design-system.md §3), until real photography exists. */}
          <div
            aria-hidden="true"
            className="flex h-40 flex-1 items-center justify-center rounded-xl bg-[var(--brand-50)] sm:h-56 lg:max-w-sm"
          >
            <Icon icon={Gift} className="size-16 text-[var(--brand-600)]" />
          </div>
        </div>
      </section>

      {/* Cart/form step mechanics below are UNCHANGED by the hero addition
          — the anchor only scrolls to this id, nothing here affects wizard
          state or logic. */}
      <div id="precontrato-wizard">
        <PrecontractWizard
          categories={categories}
          priceListName={priceList.name}
          depositThresholds={depositThresholds}
          turnstileSiteKey={turnstileSiteKey}
        />
      </div>
    </main>
  );
}
