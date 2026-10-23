const dois = (n: number) => String(n).padStart(2, "0");

/** Data local AAAA-MM-DD (nunca toISOString, que é UTC). */
export function dataISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}
