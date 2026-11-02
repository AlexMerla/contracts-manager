"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { contractViewerPath } from "@/lib/app-url";
import { calculateDefaultDeposit, type DepositThresholds } from "@/lib/deposit";
import type { ContractDataFormValues } from "@/lib/contracts/order-schemas";
import { Card, CardContent } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";

import { createPublicPreContract } from "./actions";
import { OrderSummaryPanel } from "./order-summary-panel";
import { StepConfirm } from "./steps/step-confirm";
import { StepContractData } from "./steps/step-contract-data";
import { StepPackages } from "./steps/step-packages";
import { StepServices } from "./steps/step-services";
import type {
  PublicCategory,
  PublicOrderLine,
  PublicPackage,
  PublicQuotedLine,
} from "./types";

type StepNumber = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<StepNumber, string> = {
  1: "Sus paquetes",
  2: "Opciones de servicio",
  3: "Sus datos",
  4: "Confirmar",
};

interface PrecontractWizardProps {
  categories: PublicCategory[];
  priceListName: string;
  depositThresholds: DepositThresholds;
  turnstileSiteKey: string;
}

// Orchestrates spec §8.1's client flow: packages → (conditional) service
// options → contract data → confirm. Keeps the SAME cart/form step mechanics
// as the internal wizard (`src/app/(app)/contratos/nuevo/contract-wizard.tsx`)
// — no price-list step (the catalog is already scoped to the single
// "pública" list in page.tsx), no discount/extraCharge/deposit override (the
// server always computes these — see ./actions.ts). No database write
// happens before `createPublicPreContract` runs; every field here is plain
// client state, same discipline as the internal wizard.
export function PrecontractWizard({
  categories,
  priceListName,
  depositThresholds,
  turnstileSiteKey,
}: PrecontractWizardProps) {
  const router = useRouter();

  const [step, setStep] = useState<StepNumber>(1);
  const [orderLines, setOrderLines] = useState<PublicOrderLine[]>([]);
  const [serviceSelections, setServiceSelections] = useState<Record<string, string>>({});
  const [contractData, setContractData] = useState<ContractDataFormValues | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allPackages = useMemo(() => categories.flatMap((category) => category.packages), [categories]);

  const packagesInOrder = useMemo(() => {
    const byId = new Map(allPackages.map((pkg) => [pkg.id, pkg]));
    return orderLines
      .map((line) => ({ line, pkg: byId.get(line.packageId) ?? null }))
      .filter((entry): entry is { line: PublicOrderLine; pkg: PublicPackage } => entry.pkg != null);
  }, [orderLines, allPackages]);

  const requiredServices = useMemo(() => {
    const map = new Map<string, PublicPackage["services"][number]>();
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
  // summary panel and the confirm step's table — same discipline as the
  // internal wizard's `quotedLines`.
  const quotedLines = useMemo<PublicQuotedLine[]>(
    () =>
      packagesInOrder.map(({ line, pkg }) => ({
        packageId: pkg.id,
        name: pkg.name,
        quantity: line.quantity,
        quantityUnit: pkg.quantityUnit,
        unitPrice: pkg.price,
        lineTotal: pkg.price * line.quantity,
      })),
    [packagesInOrder]
  );

  const subtotal = useMemo(
    () => quotedLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [quotedLines]
  );

  // `discount`/`extraCharge` are always null on this flow, so `total` is
  // always the subtotal. The deposit shown is a PREVIEW only — the server
  // always recomputes it itself from the same pure rule
  // (public-precontract's "server-computed amounts only" requirement) and
  // never trusts this value.
  const total = subtotal;
  const deposit = calculateDefaultDeposit(total, depositThresholds);
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
    if (!contractData || !turnstileToken.trim()) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    const result = await createPublicPreContract({
      orderLines,
      serviceSelections: requiredServices.map((service) => ({
        serviceId: service.id,
        selectedOption: serviceSelections[service.id] ?? "",
      })),
      contractData,
      turnstileToken,
    });

    setIsSubmitting(false);

    if ("error" in result) {
      setSubmitError(result.error);
      return;
    }

    // Same destination the internal wizard's confirm redirects staff-created
    // contracts to — the viewer page has no `pre_contract`-specific state to
    // add (it only 404s on `cancelled`, per the viewer page's own comment).
    router.push(contractViewerPath(result.viewerToken));
  }

  const visibleSteps: StepNumber[] = needsServiceStep ? [1, 2, 3, 4] : [1, 3, 4];

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-5 py-8 sm:px-7">
      {/* Numbers what is SHOWN (1..N), not the internal `StepNumber` — same
          rule as the internal wizard's stepper. */}
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
            <StepPackages
              categories={categories}
              orderLines={orderLines}
              onAdd={addPackage}
              onRemove={removePackage}
              onSetQuantity={setQuantity}
              onNext={() => goToStep(needsServiceStep ? 2 : 3)}
            />
          )}

          {step === 2 && needsServiceStep && (
            <StepServices
              requiredServices={requiredServices}
              selections={serviceSelections}
              onChange={(serviceId, selectedOption) =>
                setServiceSelections((current) => ({ ...current, [serviceId]: selectedOption }))
              }
              onBack={() => goToStep(1)}
              onNext={() => goToStep(3)}
            />
          )}

          {step === 3 && (
            <StepContractData
              initialValues={contractData}
              onBack={() => goToStep(needsServiceStep ? 2 : 1)}
              onNext={(values) => {
                setContractData(values);
                goToStep(4);
              }}
            />
          )}

          {step === 4 && (
            <StepConfirm
              quotedLines={quotedLines}
              subtotal={subtotal}
              deposit={deposit}
              total={total}
              balance={balance}
              turnstileSiteKey={turnstileSiteKey}
              turnstileToken={turnstileToken}
              onTurnstileToken={setTurnstileToken}
              submitError={submitError}
              isSubmitting={isSubmitting}
              onBack={() => goToStep(3)}
              onConfirm={handleConfirm}
            />
          )}
        </div>

        <OrderSummaryPanel
          priceListName={priceListName}
          lines={quotedLines}
          subtotal={subtotal}
          total={total}
          deposit={deposit}
          balance={balance}
          contractData={contractData}
        />
      </div>
    </div>
  );
}
