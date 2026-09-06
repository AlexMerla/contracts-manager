"use client";

import { Fragment } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";

// Reusable editable-list control for `services.options` (spec §6.6): an
// array of strings for "choose 1 of N" services. Fully controlled (plain
// `value`/`onChange`, not wired to react-hook-form's `useFieldArray`
// directly) so it can be dropped into any form via `Controller` without
// needing its own generic form-value typing.
interface OptionsEditorProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function OptionsEditor({ value, onChange }: OptionsEditorProps) {
  function updateAt(index: number, text: string) {
    const next = [...value];
    next[index] = text;
    onChange(next);
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index === 0) {
      return;
    }
    const next = [...value];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function moveDown(index: number) {
    if (index === value.length - 1) {
      return;
    }
    const next = [...value];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  function addOption() {
    onChange([...value, ""]);
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sin opciones — el cliente no elige entre variantes de este
          servicio.
        </p>
      )}
      {value.map((option, index) => (
        <Fragment key={index}>
          <div className="flex items-center gap-1.5">
            <Input
              value={option}
              onChange={(event) => updateAt(index, event.target.value)}
              placeholder={`Opción ${index + 1}`}
              aria-label={`Opción ${index + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === 0}
              onClick={() => moveUp(index)}
              aria-label="Mover arriba"
            >
              <Icon icon={ArrowUp} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === value.length - 1}
              onClick={() => moveDown(index)}
              aria-label="Mover abajo"
            >
              <Icon icon={ArrowDown} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeAt(index)}
              aria-label="Eliminar opción"
            >
              <Icon icon={Trash2} />
            </Button>
          </div>
        </Fragment>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={addOption}
      >
        <Icon icon={Plus} />
        Agregar opción
      </Button>
    </div>
  );
}
