"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

// Sprint 7 task 5 — the manual fallback for the ManyChat trigger, which has
// no status column and therefore no structured retry (spec §6.4 defines no
// `whatsapp_triggered`). The link must be visible and copyable on EVERY
// contract, succeeded or not, so this component is rendered unconditionally
// by the detail page rather than gated on any flag.

interface CopyViewerLinkProps {
  /** Absolute public URL, or `null` when APP_BASE_URL is unconfigured. */
  url: string | null;
}

export function CopyViewerLink({ url }: CopyViewerLinkProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!url) {
    // Content rule, docs/design-system.md §3: cause, then the action.
    return (
      <p className="text-sm text-muted-foreground">
        No se puede construir el enlace público: falta configurar{" "}
        <code className="font-mono text-xs">APP_BASE_URL</code> en el entorno.
      </p>
    );
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url!);
      setCopied(true);
    } catch {
      // `navigator.clipboard` needs a secure context and permission. The URL
      // is rendered in full and selectable next to this button precisely so
      // the operator always has a manual path.
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">
        {url}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onCopy}>
        <Icon icon={copied ? Check : Copy} aria-hidden="true" />
        {copied ? "Enlace copiado" : "Copiar enlace"}
      </Button>
    </div>
  );
}
