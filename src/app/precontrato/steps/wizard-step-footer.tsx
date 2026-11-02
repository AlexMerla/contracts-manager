import { Card, CardContent } from "@/components/ui/card";

// Same shared footer shape as the internal wizard's
// src/app/(app)/contratos/nuevo/steps/wizard-step-footer.tsx — duplicated
// rather than imported because it is purely presentational (no business
// logic) and the public route tree deliberately shares no component with the
// `(app)` group (see src/app/precontrato/layout.tsx's isolation note).
export function WizardStepFooter({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">{children}</CardContent>
    </Card>
  );
}
