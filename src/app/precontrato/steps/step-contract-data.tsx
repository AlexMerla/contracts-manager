"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { contractDataSchema, type ContractDataFormValues } from "@/lib/contracts/order-schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_TYPE_LABEL } from "@/lib/event-type";

import { WizardStepFooter } from "./wizard-step-footer";

interface StepContractDataProps {
  initialValues: ContractDataFormValues | null;
  onBack: () => void;
  onNext: (values: ContractDataFormValues) => void;
}

// `eventType: ""` is a sentinel for "nothing chosen yet" (same pattern as the
// internal wizard's step-contract-data.tsx and step-services.tsx).
const EMPTY_VALUES = {
  clientName: "",
  clientPhone: "",
  clientMobile: "",
  clientEmail: "",
  clientAddress: "",
  eventType: "",
  celebrated: "",
  eventDate: "",
  eventTime: "",
  placeName: "",
  placeAddress: "",
} as unknown as ContractDataFormValues;

// Spec §8.1 — react-hook-form + the SAME `contractDataSchema` the public
// server action re-validates against (@/lib/contracts/order-schemas), so a
// value that passes here cannot fail there. Field-for-field identical to the
// internal wizard's step; no field here is optional "because this is the
// public one" — the same client/event data is required either way.
export function StepContractData({ initialValues, onBack, onNext }: StepContractDataProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ContractDataFormValues>({
    resolver: zodResolver(contractDataSchema),
    defaultValues: initialValues ?? EMPTY_VALUES,
  });

  return (
    <form onSubmit={handleSubmit(onNext)} noValidate className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <FieldSet>
            <FieldLegend>Sus datos</FieldLegend>
            <FieldGroup>
              <Field data-invalid={!!errors.clientName}>
                <FieldLabel htmlFor="clientName">Nombre</FieldLabel>
                <Input id="clientName" {...register("clientName")} />
                <FieldError errors={[errors.clientName]} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.clientPhone}>
                  <FieldLabel htmlFor="clientPhone">Teléfono (opcional)</FieldLabel>
                  <Input id="clientPhone" {...register("clientPhone")} />
                  <FieldError errors={[errors.clientPhone]} />
                </Field>
                <Field data-invalid={!!errors.clientMobile}>
                  <FieldLabel htmlFor="clientMobile">Celular</FieldLabel>
                  <Input id="clientMobile" {...register("clientMobile")} />
                  <FieldError errors={[errors.clientMobile]} />
                </Field>
              </div>

              <Field data-invalid={!!errors.clientEmail}>
                <FieldLabel htmlFor="clientEmail">Correo</FieldLabel>
                <Input id="clientEmail" type="email" {...register("clientEmail")} />
                <FieldError errors={[errors.clientEmail]} />
              </Field>

              <Field data-invalid={!!errors.clientAddress}>
                <FieldLabel htmlFor="clientAddress">Dirección (opcional)</FieldLabel>
                <Input id="clientAddress" {...register("clientAddress")} />
                <FieldError errors={[errors.clientAddress]} />
              </Field>
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <FieldSet>
            <FieldLegend>Datos del evento</FieldLegend>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.eventType}>
                  <FieldLabel htmlFor="eventType">Tipo de evento</FieldLabel>
                  <Controller
                    control={control}
                    name="eventType"
                    render={({ field }) => (
                      <Select
                        items={EVENT_TYPE_LABEL}
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger id="eventType" className="w-full">
                          <SelectValue placeholder="Seleccione el tipo de evento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="quinceanera">{EVENT_TYPE_LABEL.quinceanera}</SelectItem>
                          <SelectItem value="wedding">{EVENT_TYPE_LABEL.wedding}</SelectItem>
                          <SelectItem value="birthday">{EVENT_TYPE_LABEL.birthday}</SelectItem>
                          <SelectItem value="graduation">{EVENT_TYPE_LABEL.graduation}</SelectItem>
                          <SelectItem value="posada">{EVENT_TYPE_LABEL.posada}</SelectItem>
                          <SelectItem value="other">{EVENT_TYPE_LABEL.other}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.eventType]} />
                </Field>
                <Field data-invalid={!!errors.celebrated}>
                  <FieldLabel htmlFor="celebrated">Festejado(s) (opcional)</FieldLabel>
                  <Input id="celebrated" {...register("celebrated")} />
                  <FieldError errors={[errors.celebrated]} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.eventDate}>
                  <FieldLabel htmlFor="eventDate">Fecha del evento</FieldLabel>
                  <Input id="eventDate" type="date" {...register("eventDate")} />
                  <FieldError errors={[errors.eventDate]} />
                </Field>
                <Field data-invalid={!!errors.eventTime}>
                  <FieldLabel htmlFor="eventTime">Hora del evento (opcional)</FieldLabel>
                  <Input id="eventTime" type="time" {...register("eventTime")} />
                  <FieldError errors={[errors.eventTime]} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.placeName}>
                  <FieldLabel htmlFor="placeName">Lugar (opcional)</FieldLabel>
                  <Input id="placeName" {...register("placeName")} />
                  <FieldError errors={[errors.placeName]} />
                </Field>
                <Field data-invalid={!!errors.placeAddress}>
                  <FieldLabel htmlFor="placeAddress">Dirección del lugar (opcional)</FieldLabel>
                  <Input id="placeAddress" {...register("placeAddress")} />
                  <FieldError errors={[errors.placeAddress]} />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      <WizardStepFooter>
        <Button type="button" variant="ghost" onClick={onBack}>
          Atrás
        </Button>
        <Button type="submit">Continuar</Button>
      </WizardStepFooter>
    </form>
  );
}
