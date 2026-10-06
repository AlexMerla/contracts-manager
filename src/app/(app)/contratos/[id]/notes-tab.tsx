"use client";

import { useState } from "react";
import { StickyNote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";

import { addNote } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

export interface NoteRow {
  id: string;
  text: string;
  createdAt: Date;
  authorName: string;
}

interface NotesTabProps {
  contractId: string;
  notes: NoteRow[];
}

// Append-only audit trail (design decision #9) — no edit/delete control
// exists for a note once saved.
export function NotesTab({ contractId, notes }: NotesTabProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await addNote({ contractId, text });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setText("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Escriba una nota sobre este contrato…"
          rows={3}
        />
        {error && (
          <p role="alert" className="text-sm font-normal text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={isSubmitting || text.trim() === ""}
            onClick={handleSubmit}
          >
            {isSubmitting ? "Guardando…" : "Guardar nota"}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="Todavía no hay notas"
          description="Las notas que agregue sobre este contrato aparecerán aquí."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium">{note.authorName}</span>
                <span>{dateFormatter.format(note.createdAt)}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{note.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
