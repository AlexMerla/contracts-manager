"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { calculateDefaultDeposit, type DepositThresholds } from "@/lib/deposit";

import { createContract } from "../actions";
import { StepPriceList } from "./steps/step-price-list";
import { StepPackages } from "./steps/step-packages";
import { StepServices } from "./steps/step-services";
import { StepContractData } from "./steps/step-contract-data";
import { StepConfirm } from "./steps/step-confirm";
import type { ContractDataFormValues } from "./schema";
import type { CatalogCategory, CatalogPackage, CatalogPriceList, OrderLine } from "./types";

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

  const subtotal = useMemo(
    () =>
      packagesInOrder.reduce(
        (sum, { line, pkg }) => sum + (pkg.pricesByPriceListId[priceListId] ?? 0) * line.quantity,
        0
      ),
    [packagesInOrder, priceListId]
  );

  const total = subtotal - (discount ?? 0) + (extraCharge ?? 0);
  const deposit = depositOverride ?? calculateDefaultDeposit(total, depositThresholds);
  const balance = total - deposit;

  function addPackage(packageId: string) {
    setOrderLines((current) => [...current, { packageId, quantity: 1 }]);
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
  }

  function setQuantity(packageId: string, quantity: number) {
    const pkg = allPackages.find((candidate) => candidate.id === packageId);
    const maxQuantity = pkg?.maxQuantity ?? 1;
    const clamped = Math.min(Math.max(quantity, 1), maxQuantity);
    setOrderLines((current) =>
      current.map((line) => (line.packageId === packageId ? { ...line, quantity: clamped } : line))
    );
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

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-7 py-6">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium tracking-wide uppercase">
        {visibleSteps.map((n) => (
          <li
            key={n}
            aria-current={step === n ? "step" : undefined}
            className={step === n ? "text-foreground" : "text-muted-foreground"}
          >
            {n}. {STEP_LABELS[n]}
          </li>
        ))}
      </ol>

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
  );
}
