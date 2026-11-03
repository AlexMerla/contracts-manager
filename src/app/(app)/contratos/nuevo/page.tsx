import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDepositThresholds } from "@/lib/deposit-config";
import { PageHeader } from "@/components/page-header";

import { ContractWizard } from "./contract-wizard";
import { loadWizardCatalog } from "./load-wizard-catalog";

// Spec §5: contract creation is open to both roles, so this only requires an
// authenticated session (no `requireRole`) — unlike the catalog CRUD pages,
// which are super-only.
export default async function NuevoContratoPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const priceLists = await prisma.priceList.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { contracts: true } } },
  });

  const categories = await loadWizardCatalog();

  const depositThresholds = getDepositThresholds();

  return (
    <>
      <PageHeader
        title="Nuevo contrato"
        subtitle="Arme el pedido, resuelva las opciones de servicio y confirme los montos."
      />
      <ContractWizard
        priceLists={priceLists.map((priceList) => ({
          id: priceList.id,
          name: priceList.name,
          isDefault: priceList.isDefault,
          contractCount: priceList._count.contracts,
        }))}
        categories={categories}
        depositThresholds={depositThresholds}
      />
    </>
  );
}
