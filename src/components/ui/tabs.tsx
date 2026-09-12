"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"

// NOTE: TabsPrimitive.Indicator is intentionally NOT wrapped or exported.
// It renders `hidden` until client-side layout measurement settles
// (@base-ui/react/tabs/indicator/TabsIndicator.js), so it is invisible in
// SSR HTML. The active underline lives on the Tab itself instead.
// Underline uses `--foreground` (ink), never accent — design-system.md §2.

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-b border-border",
        className
      )}
      {...props}
    />
  )
}

function TabsTab({
  className,
  count,
  children,
  ...props
}: TabsPrimitive.Tab.Props & { count?: number }) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "group/tab -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-active:border-foreground data-active:text-foreground",
        className
      )}
      {...props}
    >
      {children}
      {count != null ? (
        <Badge
          variant="secondary"
          className="group-data-active/tab:bg-foreground/10 group-data-active/tab:text-foreground"
        >
          {count}
        </Badge>
      ) : null}
    </TabsPrimitive.Tab>
  )
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTab, TabsPanel }
