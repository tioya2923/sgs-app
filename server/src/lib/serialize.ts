import { Prisma } from "../db.js";

/**
 * Converte o que o Prisma devolve para o formato que o frontend já usa:
 * Decimal → number, Date (instante) → string ISO. As datas de calendário já
 * são strings AAAA-MM-DD na base de dados.
 */
export function serialize<T>(valor: T): T {
  if (valor === null || valor === undefined) return valor;
  if (valor instanceof Date) return valor.toISOString() as unknown as T;
  if (Prisma.Decimal.isDecimal(valor)) return (valor as Prisma.Decimal).toNumber() as unknown as T;
  if (Array.isArray(valor)) return valor.map((v) => serialize(v)) as unknown as T;
  if (typeof valor === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) out[k] = serialize(v);
    return out as T;
  }
  return valor;
}
