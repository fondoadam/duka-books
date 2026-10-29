// "KES 1,250" for whole shillings, "KES 0.50" when there are cents. Replies and the ask guard both use it.
export function kes(cents: number) {
  const digits = cents % 100 === 0 ? 0 : 2;
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
}
