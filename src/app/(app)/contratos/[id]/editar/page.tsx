import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { scopeToOwner } from "@/lib/authorization";
import { contractEditBlock } from "@/lib/contracts/contract-edit";
import { getDepositThresholds } from "@/lib/deposit-config";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/page-header";

import { ContractWizard } from "../../nuevo/contract-wizard";
import { loadWizardCatalog } from "../../nuevo/load-wizard-catalog";
import type { CatalogCategory, WizardEditMode } from "../../nuevo/types";

interface EditarContratoPageProps {
  params: Promise<{ id: string }>;
}

// edit-precontract (spec §8.2) — the §8 wizard in edit mode. Ownership is the
// same `scopeToOwner` read as the detail page (a foreign or house-user
// contract is a plain 404 for `normal`); the editability rule redirects back
// to the detail with its message. `updateContract` re-checks both inside its
// row lock — this page is convenience, not the guard.
export default async function EditarContratoPage({ params }: EditarContratoPageProps) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const db = scopeToOwner(session);
  const contract = await db.contract.findUnique({
    where: { id },
    include: {
      contractPackages: true,
      contractServiceSelections: true,
      payments: { select: { amount: true } },
      priceList: { include: { _count: { select: { contracts: true } } } },
    },
  });
  if (!contract) {
    notFound();
  }

  const block = contractEditBlock(contract.contractStatus, contract.paymentStatus);
  if (block) {
    redirect(`/contratos/${contract.id}?edicion=${block}`);
  }

  // Preloaded from the contract's OWN rows, not the live catalog: kept
  // packages are included even if archived, and show their snapshot name and
  // price — exactly how `updateContract` will price them.
  const keptByPackageId = new Map(contract.contractPackages.map((line) => [line.packageId, line]));
  const liveCategories = await loadWizardCatalog([...keptByPackageId.keys()]);
  const categories: CatalogCategory[] = liveCategories.map((category) => ({
    ...category,
    packages: category.packages.map((pkg) => {
      const kept = keptByPackageId.get(pkg.id);
      if (!kept) {
        return pkg;
      }
      return {
        ...pkg,
        name: kept.nameSnapshot,
        pricesByPriceListId: {
          ...pkg.pricesByPriceListId,
          [contract.priceListId]: Number(kept.priceSnapshot),
        },
        priceLocked: true,
      };
    }),
  }));

  // A stored choice that is no longer a live option is dropped, so step 3
  // asks for a new one (spec R9) instead of submitting a stale value.
  const liveOptionsByServiceId = new Map(
    categories.flatMap((category) =>
      category.packages.flatMap((pkg) => pkg.services.map((service) => [service.id, service.options] as const))
    )
  );
  const serviceSelections = Object.fromEntries(
    contract.contractServiceSelections
      .filter((selection) => liveOptionsByServiceId.get(selection.serviceId)?.includes(selection.selectedOption))
      .map((selection) => [selection.serviceId, selection.selectedOption])
  );

  const edit: WizardEditMode = {
    contractId: contract.id,
    orderLines: contract.contractPackages.map((line) => ({
      packageId: line.packageId,
      quantity: line.quantity,
    })),
    serviceSelections,
    contractData: {
      clientName: contract.clientName,
      clientPhone: contract.clientPhone ?? "",
      clientMobile: contract.clientMobile ?? "",
      clientEmail: contract.clientEmail ?? "",
      clientAddress: contract.clientAddress ?? "",
      eventType: contract.eventType,
      celebrated: contract.celebrated ?? "",
      eventDate: contract.eventDate.toISOString().slice(0, 10),
      eventTime: contract.eventTime ? contract.eventTime.toISOString().slice(11, 16) : "",
      placeName: contract.placeName ?? "",
      placeAddress: contract.placeAddress ?? "",
    },
    discount: contract.discount == null ? null : Number(contract.discount),
    extraCharge: contract.extraCharge == null ? null : Number(contract.extraCharge),
    deposit: Number(contract.deposit),
    depositLocked: contract.paymentStatus !== "pending",
    totalPaid: contract.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
  };

  return (
    <>
      <PageHeader
        title={`Editar ${contract.folio} · ${contract.clientName}`}
        breadcrumb={
          <Link
            href={`/contratos/${contract.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Icon icon={ArrowLeft} className="size-3.5" />
            {contract.folio}
          </Link>
        }
        subtitle="Los paquetes que ya tiene el contrato conservan su precio pactado; los nuevos toman el precio de la lista del contrato."
      />
      <ContractWizard
        // Only the contract's own list — immutable, even if since deactivated.
        priceLists={[
          {
            id: contract.priceList.id,
            name: contract.priceList.name,
            isDefault: contract.priceList.isDefault,
            contractCount: contract.priceList._count.contracts,
          },
        ]}
        categories={categories}
        depositThresholds={getDepositThresholds()}
        edit={edit}
      />
    </>
  );
}
