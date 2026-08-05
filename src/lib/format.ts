const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateLongFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
const currencyFmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [datePart] = iso.split("T");
  const d = new Date(datePart + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return dateFmt.format(d);
}

export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [datePart] = iso.split("T");
  const d = new Date(datePart + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return dateLongFmt.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [datePart, timePart] = iso.split("T");
  const base = formatDate(datePart);
  return timePart ? `${base}, ${timePart.slice(0, 5)}` : base;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return currencyFmt.format(value);
}

export function idade(dataNascimento: string): number {
  const hoje = new Date();
  const nasc = new Date(dataNascimento + "T00:00:00");
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const aindaNaoFezAnos =
    hoje.getMonth() < nasc.getMonth() ||
    (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate());
  if (aindaNaoFezAnos) anos -= 1;
  return anos;
}

export function diasAte(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(iso + "T00:00:00");
  return Math.round((alvo.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
}
