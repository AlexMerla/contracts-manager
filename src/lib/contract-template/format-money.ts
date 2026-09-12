// Spec §7: monetary fields drawn onto the contract image use the same
// `Intl.NumberFormat('es-MX', ...)` formatting as the on-screen `Money`
// component (src/components/money.tsx) — but that component returns JSX,
// which is useless when drawing onto a canvas, so this is the plain-
// function equivalent shared by every money field in
// generate-contract-image.ts (total, deposit, balance, extra charge).
const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export function formatMoney(amount: number): string {
  return currencyFormatter.format(amount);
}
