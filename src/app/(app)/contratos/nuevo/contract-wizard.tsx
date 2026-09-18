"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { calculateDefaultDeposit, type DepositThresholds } from "@/lib/deposit";
import { Stepper } from "@/components/ui/stepper";
import { Card, CardContent } from "@/components/ui/card";

import { createContract } from "../actions";
import { OrderSummaryPanel } from "./order-summary-panel";
import { StepPriceList } from "./steps/step-price-list";
import { StepPackages } from "./steps/step-packages";
import { StepServices } from "./steps/step-services";
import { StepContractData } from "./steps/step-contract-data";
import { StepConfirm } from "./steps/step-confirm";
import type { ContractDataFormValues } from "./schema";
import type {
  CatalogCategory,
  CatalogPackage,
  CatalogPriceList,
  OrderLine,
  QuotedLine,
} from "./types";

type StepNumber = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<StepNumber, string> = {
  1: "Lista de precios",
  2: "Paquetes",
  3: "Servicios",
  4: "Datos del contrato",
  5: "Confirmar montos",
};

interface ContractWizardProps {
  priceLists: CatalogPriceList[];
  categories: CatalogCategory[];
  depositThresholds: DepositThresholds;
}

// Orchestrates spec §8's 6-step "store mode" flow (sprint-04 tasks 1-5 are
// the client-only steps below; step 6, the actual database write, is
// `createContract` in ../actions.ts, called only from the final confirm
// step). No database write happens before that call — every field here is
// plain client state.
export function ContractWizard({ priceLists, categories, depositThresholds }: ContractWizardProps) {
  const router = useRouter();
  const defaultPriceListId = priceLists.find((pl) => pl.isDefault)?.id ?? priceLists[0]?.id ?? "";

  const [step, setStep] = useState<StepNumber>(1);
  const [priceListId, setPriceListId] = useState(defaultPriceListId);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [serviceSelections, setServiceSelections] = useState<Record<string, string>>({});
  const [contractData, setContractData] = useState<ContractDataFormValues | null>(null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [extraCharge, setExtraCharge] = useState<number | null>(null);
  const [depositOverride, setDepositOverride] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allPackages = useMemo(() => categories.flatMap((category) => category.packages), [categories]);

  const packagesInOrder = useMemo(() => {
    const byId = new Map(allPackages.map((pkg) => [pkg.id, pkg]));
    return orderLines
      .map((line) => ({ line, pkg: byId.get(line.packageId) ?? null }))
      .filter((entry): entry is { line: OrderLine; pkg: CatalogPackage } => entry.pkg != null);
  }, [orderLines, allPackages]);

  const requiredServices = useMemo(() => {
    const map = new Map<string, CatalogPackage["services"][number]>();
    for (const { pkg } of packagesInOrder) {
      for (const service of pkg.services) {
        if (service.options.length > 0) {
          map.set(service.id, service);
        }
      }
    }
    return Array.from(map.values());
  }, [packagesInOrder]);

  const needsServiceStep = requiredServices.length > 0;

  // ONE derivation of the priced order, consumed by both the persistent
  // summary panel and step 5's "Servicios cotizados" table. Deriving it twice
  // is exactly how the `PQ-xx` code or a line total would drift between the
  // two surfaces.
  const quotedLines = useMemo<QuotedLine[]>(
    () =>
      packagesInOrder.map(({ line, pkg }) => {
        const unitPrice = pkg.pricesByPriceListId[priceListId] ?? 0;
        return {
          packageId: pkg.id,
          code: pkg.code,
          name: pkg.name,
          quantity: line.quantity,
          quantityUnit: pkg.quantityUnit,
          unitPrice,
          lineTotal: unitPrice * line.quantity,
        };
      }),
    [packagesInOrder, priceListId]
  );

  const subtotal = useMemo(
    () => quotedLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [quotedLines]
  );

  const total = subtotal - (discount ?? 0) + (extraCharge ?? 0);
  const deposit = depositOverride ?? calculateDefaultDeposit(total, depositThresholds);
  const balance = total - deposit;

  function addPackage(packageId: string) {
    setOrderLines((current) => [...current, { packageId, quantity: 1 }]);
    setDepositOverride(null);
  }

  function removePackage(packageId: string) {
    setOrderLines((current) => current.filter((line) => line.packageId !== packageId));
    setServiceSelections((current) => {
      const pkg = allPackages.find((candidate) => candidate.id === packageId);
      if (!pkg) {
        return current;
      }
      const next = { ...current };
      for (const service of pkg.services) {
        delete next[service.id];
      }
      return next;
    });
    setDepositOverride(null);
  }

  function setQuantity(packageId: string, quantity: number) {
    const pkg = allPackages.find((candidate) => candidate.id === packageId);
    const maxQuantity = pkg?.maxQuantity ?? 1;
    const clamped = Math.min(Math.max(quantity, 1), maxQuantity);
    setOrderLines((current) =>
      current.map((line) => (line.packageId === packageId ? { ...line, quantity: clamped } : line))
    );
    setDepositOverride(null);
  }

  function goToStep(next: StepNumber) {
    setSubmitError(null);
    setStep(next);
  }

  async function handleConfirm() {
    if (!contractData) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    const result = await createContract({
      priceListId,
      orderLines,
      serviceSelections: requiredServices.map((service) => ({
        serviceId: service.id,
        selectedOption: serviceSelections[service.id] ?? "",
      })),
      contractData,
      discount,
      extraCharge,
      deposit,
    });

    setIsSubmitting(false);

    if ("error" in result) {
      setSubmitError(result.error);
      return;
    }

    router.push(`/contratos/${result.contractId}`);
  }

  const visibleSteps: StepNumber[] = needsServiceStep ? [1, 2, 3, 4, 5] : [1, 2, 4, 5];
  const selectedPriceList = priceLists.find((priceList) => priceList.id === priceListId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-7 py-6">
      {/* The stepper numbers what is SHOWN (1..N), not the internal
          `StepNumber`: when step 3 is skipped, "Datos del contrato" must read
          as stage 3 of 4, never as a gap between 2 and 4. */}
      <Card>
        <CardContent>
          <Stepper
            steps={visibleSteps.map((n) => ({ id: n, label: STEP_LABELS[n] }))}
            currentId={step}
          />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {step === 1 && (
            <StepPriceList
              priceLists={priceLists}
              priceListId={priceListId}
              onChange={setPriceListId}
              onNext={() => goToStep(2)}
            />
          )}

          {step === 2 && (
            <StepPackages
              categories={categories}
              priceListId={priceListId}
              orderLines={orderLines}
              onAdd={addPackage}
              onRemove={removePackage}
              onSetQuantity={setQuantity}
              onBack={() => goToStep(1)}
              onNext={() => goToStep(needsServiceStep ? 3 : 4)}
            />
          )}

          {step === 3 && needsServiceStep && (
            <StepServices
              requiredServices={requiredServices}
              selections={serviceSelections}
              onChange={(serviceId, selectedOption) =>
                setServiceSelections((current) => ({ ...current, [serviceId]: selectedOption }))
              }
              onBack={() => goToStep(2)}
              onNext={() => goToStep(4)}
            />
          )}

          {step === 4 && (
            <StepContractData
              initialValues={contractData}
              onBack={() => goToStep(needsServiceStep ? 3 : 2)}
              onNext={(values) => {
                setContractData(values);
                goToStep(5);
              }}
            />
          )}

          {step === 5 && (
            <StepConfirm
              quotedLines={quotedLines}
              subtotal={subtotal}
              discount={discount}
              extraCharge={extraCharge}
              deposit={deposit}
              total={total}
              balance={balance}
              onDiscountChange={setDiscount}
              onExtraChargeChange={setExtraCharge}
              onDepositChange={setDepositOverride}
              submitError={submitError}
              isSubmitting={isSubmitting}
              onBack={() => goToStep(4)}
              onConfirm={handleConfirm}
            />
          )}
        </div>

        <OrderSummaryPanel
          priceListName={selectedPriceList?.name ?? null}
          lines={quotedLines}
          subtotal={subtotal}
          discount={discount}
          extraCharge={extraCharge}
          total={total}
          deposit={deposit}
          balance={balance}
          contractData={contractData}
        />
      </div>
    </div>
  );
}
