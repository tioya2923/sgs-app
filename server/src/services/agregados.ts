import { idade } from "../lib/datas.js";
import type { Tx } from "./stock.js";

/** Recalcula nº de pessoas e de menores a partir das pessoas reais (nunca fica dessincronizado). */
export async function recalcularAgregado(tx: Tx, agregadoId: string): Promise<void> {
  const pessoas = await tx.pessoa.findMany({ where: { agregadoId }, select: { dataNascimento: true } });
  await tx.agregado.update({
    where: { id: agregadoId },
    data: {
      numPessoas: pessoas.length,
      numMenores: pessoas.filter((p) => idade(p.dataNascimento) < 18).length,
    },
  });
}
