import type { Tx } from "./stock.js";

// Chaves dos bloqueios consultivos: serializam a atribuição de códigos/números
// para dois pedidos em simultâneo não receberem o mesmo.
const LOCK_AGREGADO = 7001;
const LOCK_PROCESSO = 7002;

export async function proximoCodigoAgregado(tx: Tx): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_AGREGADO})`;
  const codigos = await tx.agregado.findMany({ select: { codigo: true } });
  const max = codigos.reduce((m, a) => Math.max(m, parseInt(a.codigo.replace(/\D/g, ""), 10) || 0), 0);
  return `AG-${String(max + 1).padStart(3, "0")}`;
}

export async function proximoNumeroProcesso(tx: Tx): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_PROCESSO})`;
  const r = await tx.processo.aggregate({ _max: { numero: true } });
  return (r._max.numero ?? 0) + 1;
}
