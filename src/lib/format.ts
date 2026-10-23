const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateLongFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
const currencyFmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

const dois = (n: number) => String(n).padStart(2, "0");

/**
 * Data local no formato AAAA-MM-DD. toISOString() devolve UTC, e em Lisboa
 * (UTC+1 no verão) isso fazia "hoje" ser ainda ontem entre as 00:00 e as 01:00
 * e o dia 1 de cada mês aparecer como o último dia do mês anterior.
 */
export function dataISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

export function hojeISO(): string {
  return dataISO();
}

export function inicioMesISO(): string {
  const d = new Date();
  return dataISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Data e hora locais (minuto) no formato AAAA-MM-DDTHH:mm — o que um input datetime-local espera. */
export function agoraLocalISO(d: Date = new Date()): string {
  return `${dataISO(d)}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Um instante do servidor (com Z ou desvio horário) passa para a data local antes de se formatar.
  const instante = /(Z|[+-]\d{2}:\d{2})$/.test(iso) && iso.includes("T") ? new Date(iso) : null;
  if (instante && !Number.isNaN(instante.getTime())) return dateFmt.format(instante);
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
  // Instantes que vêm do servidor (com Z ou desvio horário) mostram-se na hora local.
  if (/(Z|[+-]\d{2}:\d{2})$/.test(iso)) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return `${formatDate(dataISO(d))}, ${dois(d.getHours())}:${dois(d.getMinutes())}`;
  }
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
