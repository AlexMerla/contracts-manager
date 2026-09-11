"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

import { contractDataSchema, type ContractDataFormValues } from "../schema";

interface StepContractDataProps {
  initialValues: ContractDataFormValues | null;
  onBack: () => void;
  onNext: (values: ContractDataFormValues) => void;
}

const EMPTY_VALUES: ContractDataFormValues = {
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
};

// Spec §8 step 4 / sprint-04 task 4: react-hook-form + zod per spec §3.
// `contractDataSchema` (schema.ts) is the exact schema the server action
// re-validates against, so a value that passes here cannot fail there.
export function StepContractData({ initialValues, onBack, onNext }: StepContractDataProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContractDataFormValues>({
    resolver: zodResolver(contractDataSchema),
    defaultValues: initialValues ?? EMPTY_VALUES,
  });

  return (
    <form onSubmit={handleSubmit(onNext)} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={!!errors.clientName}>
          <FieldLabel htmlFor="clientName">Nombre del cliente</FieldLabel>
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
            <FieldLabel htmlFor="clientMobile">Celular (opcional)</FieldLabel>
            <Input id="clientMobile" {...register("clientMobile")} />
            <FieldError errors={[errors.clientMobile]} />
          </Field>
        </div>

        <Field data-invalid={!!errors.clientEmail}>
          <FieldLabel htmlFor="clientEmail">Correo (opcional)</FieldLabel>
          <Input id="clientEmail" type="email" {...register("clientEmail")} />
          <FieldError errors={[errors.clientEmail]} />
        </Field>

        <Field data-invalid={!!errors.clientAddress}>
          <FieldLabel htmlFor="clientAddress">Dirección del cliente (opcional)</FieldLabel>
          <Input id="clientAddress" {...register("clientAddress")} />
          <FieldError errors={[errors.clientAddress]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.eventType}>
            <FieldLabel htmlFor="eventType">Tipo de evento</FieldLabel>
            <Input
              id="eventType"
              placeholder="Ej. boda, XV años, graduación"
              {...register("eventType")}
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

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Atrás
        </Button>
        <Button type="submit">Continuar</Button>
      </div>
    </form>
  );
}
