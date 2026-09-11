"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { CatalogServiceRef } from "../types";

interface StepServicesProps {
  requiredServices: CatalogServiceRef[];
  selections: Record<string, string>;
  onChange: (serviceId: string, selectedOption: string) => void;
  onBack: () => void;
  onNext: () => void;
}

// Spec §8 step 3 / sprint-04 task 3: only reached when at least one package
// in the order includes a service with non-empty `options` (spec §6.6).
// The wizard skips straight to step 4 otherwise — see ContractWizard's
// `needsServiceStep`.
export function StepServices({
  requiredServices,
  selections,
  onChange,
  onBack,
  onNext,
}: StepServicesProps) {
  const allSelected = requiredServices.every(
    (service) => selections[service.id] && service.options.includes(selections[service.id])
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Elija una opción por servicio</CardTitle>
          <CardDescription>
            Los paquetes agregados incluyen estos servicios con variantes —
            debe elegir una opción de cada uno antes de continuar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {requiredServices.map((service) => (
            <Field key={service.id}>
              <FieldLabel htmlFor={`service-${service.id}`}>{service.name}</FieldLabel>
              <Select
                value={selections[service.id] ?? ""}
                onValueChange={(value) => onChange(service.id, value ?? "")}
              >
                <SelectTrigger id={`service-${service.id}`} className="w-full">
                  <SelectValue placeholder="Seleccione una opción" />
                </SelectTrigger>
                <SelectContent>
                  {service.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Atrás
        </Button>
        <Button type="button" disabled={!allSelected} onClick={onNext}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
