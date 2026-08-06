/**
 * Benfeitores e fornecedores não são uma lista fechada — qualquer nome novo
 * pode ser escrito livremente. Esta função só recolhe os nomes já usados
 * nos movimentos de um armazém, para sugerir e reduzir duplicados por
 * variações de escrita (ex.: "Sr. Silva" vs. "Sr. José Silva").
 */
export function sugestoesBenfeitores(
  movimentos: { fornecedor: string | null; benfeitor: string | null }[]
): string[] {
  const nomes = new Set<string>();
  for (const m of movimentos) {
    if (m.fornecedor) nomes.add(m.fornecedor);
    if (m.benfeitor) nomes.add(m.benfeitor);
  }
  return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-PT"));
}
