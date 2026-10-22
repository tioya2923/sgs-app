import type { Prisma } from "../db.js";
import { conflito } from "../lib/errors.js";

export type Tx = Prisma.TransactionClient;

export interface Consumo {
  loteId: string;
  retirado: number;
}

/**
 * Desconta `quantidade` de um artigo, lote a lote, sem nunca deixar stock
 * negativo. Os lotes ficam bloqueados (FOR UPDATE) até ao fim da transação,
 * por isso duas entregas em simultâneo não gastam o mesmo stock duas vezes.
 *
 * ordem "validade": primeiro o que caduca antes (alimentos);
 * ordem "entrada": primeiro o que entrou há mais tempo (roupa).
 */
export async function consumirStock(
  tx: Tx,
  artigoId: string,
  quantidade: number,
  ordem: "validade" | "entrada" = "validade",
  nomeArtigo?: string,
): Promise<Consumo[]> {
  const lotes =
    ordem === "validade"
      ? await tx.$queryRaw<{ id: string; quantidade: number }[]>`
          SELECT id, quantidade FROM lotes
          WHERE artigo_id = ${artigoId}::uuid AND estado = 'disponível' AND quantidade > 0
          ORDER BY validade ASC NULLS LAST, entrada ASC
          FOR UPDATE`
      : await tx.$queryRaw<{ id: string; quantidade: number }[]>`
          SELECT id, quantidade FROM lotes
          WHERE artigo_id = ${artigoId}::uuid AND estado = 'disponível' AND quantidade > 0
          ORDER BY entrada ASC, validade ASC NULLS LAST
          FOR UPDATE`;

  const disponivel = lotes.reduce((s, l) => s + l.quantidade, 0);
  if (quantidade > disponivel) {
    throw conflito(`Stock insuficiente${nomeArtigo ? ` de ${nomeArtigo}` : ""}: pedido ${quantidade}, disponível ${disponivel}.`);
  }

  const consumos: Consumo[] = [];
  let restante = quantidade;
  for (const lote of lotes) {
    if (restante <= 0) break;
    const retirado = Math.min(restante, lote.quantidade);
    await tx.lote.update({ where: { id: lote.id }, data: { quantidade: lote.quantidade - retirado } });
    consumos.push({ loteId: lote.id, retirado });
    restante -= retirado;
  }
  return consumos;
}

export async function stockDisponivel(tx: Tx, artigoId: string): Promise<number> {
  const r = await tx.lote.aggregate({ where: { artigoId, estado: "disponível" }, _sum: { quantidade: true } });
  return r._sum.quantidade ?? 0;
}
