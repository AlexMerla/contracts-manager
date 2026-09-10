export interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-20 min-h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-7 py-3">
        <div className="min-w-0">
          {breadcrumb}
          <h1 className="font-heading text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
