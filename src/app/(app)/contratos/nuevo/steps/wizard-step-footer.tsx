"use client";

import { Card, CardContent } from "@/components/ui/card";

// Shared wrapper for the Atrás/Continuar (or Crear contrato) row at the
// bottom of every wizard step, so the pie de página reads as its own
// bordered section — same visual language as the rest of the wizard's
// mockup, which puts every block (stepper, step content, footer) in its
// own `Card`.
export function WizardStepFooter({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">{children}</CardContent>
    </Card>
  );
}
