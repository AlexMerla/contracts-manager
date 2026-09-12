import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        // Tones per docs/design-system.md §2 — fixed status vocabulary,
        // don't invent new colors per screen.
        success: "bg-success-bg text-success-fg",
        warning: "bg-warning-bg text-warning-fg",
        danger: "bg-danger-bg text-danger-fg",
        info: "bg-info-bg text-info-fg",
        ink: "bg-foreground text-background",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// Solid dot tone per variant. Falls back to `bg-current` so the neutral
// variants (default/secondary/outline/...) inherit the badge's own text color.
const BADGE_DOT_TONE: Partial<Record<NonNullable<VariantProps<typeof badgeVariants>["variant"]>, string>> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
}

function Badge({
  className,
  variant = "default",
  dot = false,
  render,
  children,
  ...props
}: useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Render a solid status dot before the content (docs/design-system.md §2). */
    dot?: boolean
  }) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
      // `children` is merged LAST and is destructured out of `...props` above,
      // so neither the caller's spread nor mergeProps can clobber the dot.
      {
        children: (
          <>
            {dot ? (
              <span
                aria-hidden="true"
                data-slot="badge-dot"
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  (variant && BADGE_DOT_TONE[variant]) || "bg-current"
                )}
              />
            ) : null}
            {children}
          </>
        ),
      }
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
