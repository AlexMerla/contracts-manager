"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

import { setPackageServices } from "../actions";

interface ServiceOption {
  id: string;
  name: string;
  categoryName: string;
}

interface PackageServicesEditorProps {
  packageId: string;
  services: ServiceOption[];
  selectedServiceIds: string[];
}

export function PackageServicesEditor({
  packageId,
  services,
  selectedServiceIds,
}: PackageServicesEditorProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(selectedServiceIds)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const groupedByCategory = services.reduce<Record<string, ServiceOption[]>>(
    (groups, service) => {
      const key = service.categoryName;
      groups[key] = groups[key] ?? [];
      groups[key].push(service);
      return groups;
    },
    {}
  );

  function toggle(serviceId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(serviceId);
      } else {
        next.delete(serviceId);
      }
      return next;
    });
  }

  async function onSave() {
    setIsSubmitting(true);
    setFormError(null);
    setSaved(false);
    const result = await setPackageServices(packageId, Array.from(selected));
    setIsSubmitting(false);
    if ("error" in result) {
      setFormError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Servicios incluidos</CardTitle>
        <CardDescription>
          Marque los servicios que este paquete incluye.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {services.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ningún servicio registrado todavía.
          </p>
        )}
        <div className="flex flex-col gap-4">
          {Object.entries(groupedByCategory).map(([categoryName, items]) => (
            <div key={categoryName} className="flex flex-col gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {categoryName}
              </p>
              {items.map((service) => (
                <Label
                  key={service.id}
                  htmlFor={`service-${service.id}`}
                  className="font-normal"
                >
                  <Checkbox
                    id={`service-${service.id}`}
                    checked={selected.has(service.id)}
                    onCheckedChange={(checked) =>
                      toggle(service.id, checked === true)
                    }
                  />
                  {service.name}
                </Label>
              ))}
            </div>
          ))}
        </div>

        {formError && (
          <p role="alert" className="mt-4 text-sm font-normal text-destructive">
            {formError}
          </p>
        )}
        {saved && !formError && (
          <p className="mt-4 text-sm font-normal text-success-fg">
            Cambios guardados.
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" disabled={isSubmitting} onClick={onSave}>
          {isSubmitting ? "Guardando…" : "Guardar servicios"}
        </Button>
      </CardFooter>
    </Card>
  );
}
