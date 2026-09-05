import type { Metadata } from "next";
import { Geist, Schibsted_Grotesk, Roboto_Mono } from "next/font/google";
import "./globals.css";

// Typography per docs/design-system.md §1.2: Schibsted Grotesk for UI/body,
// Geist for display (headings, KPI/large amounts), Roboto Mono for
// folios/IDs/audit trails.
const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Todo con un Solo Proveedor",
  description: "Panel de administración de contratos y pagos",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${schibstedGrotesk.variable} ${geistSans.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
