import { CalendarCheck, FileText, Wallet } from "lucide-react";

import { Icon } from "@/components/ui/icon";
import { LoginForm } from "@/components/login-form";

const features = [
  {
    icon: FileText,
    text: "Genere contratos automáticamente y compártalos por WhatsApp.",
  },
  {
    icon: Wallet,
    text: "Lleve el control de anticipos y saldos pendientes en tiempo real.",
  },
  {
    icon: CalendarCheck,
    text: "Administre contratos, pagos y calendario desde un solo lugar.",
  },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-2">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Iniciar sesión
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingrese sus datos para acceder al panel de administración.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </div>

      <div className="hidden bg-brand text-brand-foreground lg:flex lg:flex-col lg:justify-center lg:px-12">
        <p className="font-heading text-sm font-medium tracking-wide uppercase opacity-80">
          Todo con un Solo Proveedor
        </p>
        <ul className="mt-6 flex flex-col gap-5">
          {features.map((feature) => (
            <li key={feature.text} className="flex items-start gap-3">
              <Icon icon={feature.icon} className="mt-0.5 size-5 shrink-0" />
              <span className="text-sm leading-snug">{feature.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
