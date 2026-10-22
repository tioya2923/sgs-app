// O centro funciona em hora de Lisboa; o servidor pode estar noutro fuso (UTC
// na cloud). "Hoje" calcula-se sempre neste fuso, nunca com toISOString().
export const FUSO = "Europe/Lisbon";

const fmtData = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** AAAA-MM-DD no fuso do centro. */
export function hojeISO(agora: Date = new Date()): string {
  return fmtData.format(agora);
}

/** Soma meses a uma data AAAA-MM-DD (mantém o dia, ajustando ao fim do mês se necessário). */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

export function somarAnos(iso: string, anos: number): string {
  return somarMeses(iso, anos * 12);
}

const MS_DIA = 24 * 60 * 60 * 1000;

/** Dias entre duas datas AAAA-MM-DD (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DIA);
}

export function diasAte(iso: string, hoje: string = hojeISO()): number {
  return diasEntre(hoje, iso);
}

/** Idade em anos completos à data `hoje`. */
export function idade(dataNascimento: string, hoje: string = hojeISO()): number {
  const [ha, hm, hd] = hoje.split("-").map(Number) as [number, number, number];
  const [na, nm, nd] = dataNascimento.split("-").map(Number) as [number, number, number];
  let anos = ha - na;
  if (hm < nm || (hm === nm && hd < nd)) anos -= 1;
  return anos;
}

export function periodicidadeEmMeses(p: "Mensal" | "Trimestral" | "Semestral"): number {
  return p === "Mensal" ? 1 : p === "Trimestral" ? 3 : 6;
}
