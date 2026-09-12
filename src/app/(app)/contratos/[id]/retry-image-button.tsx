"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { regenerateContractImage } from "../actions";

interface RetryImageButtonProps {
  contractId: string;
}

// Sprint 5 task 7 / spec §4.2: manual retry for a status column that
// failed at confirm time. Only rendered when `imageGenerated` is `false`
// (see the parent page) — once it succeeds, `revalidatePath` inside the
// action refreshes the server-rendered page and this button disappears.
export function RetryImageButton({ contractId }: RetryImageButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRetry() {
    setIsRetrying(true);
    setError(null);
    const result = await regenerateContractImage(contractId);
    setIsRetrying(false);
    if ("error" in result) {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={isRetrying} onClick={onRetry}>
        {isRetrying ? "Generando…" : "Reintentar generación de imagen"}
      </Button>
      {error && (
        <p role="alert" className="text-xs font-normal text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
