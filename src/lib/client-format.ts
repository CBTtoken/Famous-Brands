export function money(cents: number | null | undefined) {
  if (cents == null) return "";
  return `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
