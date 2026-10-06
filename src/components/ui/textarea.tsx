import * as React from "react";
import { cn } from "cn";

// Design-system.md §3 names `Textarea` as a primitive, but none existed —
// `Input` (src/components/ui/input.tsx) wraps Base UI's `InputPrimitive`,
// which has no textarea equivalent, so this is a plain `<textarea>` styled
// to match `Input`'s class vocabulary exactly (height swapped for a min-height
// and vertical resize instead of a fixed single-line height).
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-16 w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
