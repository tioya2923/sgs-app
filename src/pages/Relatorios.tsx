import { useMemo, useState } from "react";
import { useDb } from "../store/db";
import { Button, Card, DataTable, SectionHeading, StatTile } from "../components/ui";
import { formatCurrency } from "../lib/format";

function inicioMesISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function baixarCsv(nomeFicheiro: string, linhas: string[][]) {
  const conteudo = linhas.map((linha) => linha.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeFicheiro;
  link.click();
  URL.revokeObjectURL(url);
}

export function Relatorios() {
  const { db } = useDb();
  const [anonimizar, setAnonimizar] = useState(true);
  const inicioMes = inicioMesISO();

  const porFreguesia = useMemo(() => {
    const mapa = new Map<string, { agregados: number; pessoas: number; cabazes: number }>();
    for (const agregado of db.agregados) {
      const entry = mapa.get(agregado.freguesia) ?? { agregados: 0, pessoas: 0, cabazes: 0 };
      entry.agregados += 1;
      entry.pessoas += agregado.numPessoas;
      entry.cabazes += db.entregasCabaz.filter(
        (e) => e.agregadoId === agregado.id && e.estado === "Entregue" && e.dataPrevista >= inicioMes
      ).length;
      mapa.set(agregado.freguesia, entry);
    }
    return Array.from(mapa.entries()).sort((a, b) => b[1].pessoas - a[1].pessoas);
  }, [db, inicioMes]);

  const porFinanciador = useMemo(() => {
    const mapa = new Map<string, { cartoes: number; valor: number }>();
    for (const c of db.cartoes) {
      const entry = mapa.get(c.origemFundo) ?? { cartoes: 0, valor: 0 };
      entry.cartoes += 1;
      entry.valor += c.valor;
      mapa.set(c.origemFundo, entry);
    }
    return Array.from(mapa.entries());
  }, [db]);

  const cabazesMes = db.entregasCabaz.filter((e) => e.estado === "Entregue" && e.dataPrevista >= inicioMes).length;
  const refeicoesMes = db.refeicoesContagem.filter((r) => r.data >= inicioMes).reduce((s, r) => s + r.numPessoas, 0);
  const roupaMes = db.entregasRoupa.filter((e) => e.data >= inicioMes).length;
  const novosProcessosMes = db.processos.filter((p) => p.dataAbertura >= inicioMes).length;

  return (
    <div>
      <SectionHeading title="Relatórios" />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Cabazes este mês" value={cabazesMes} tone="pine" />
        <StatTile label="Refeições este mês" value={refeicoesMes} tone="gold" />
        <StatTile label="Entregas de roupa" value={roupaMes} tone="neutral" />
        <StatTile label="Novos processos" value={novosProcessosMes} tone="terracotta" />
      </div>

      <Card
        title="Mapa por freguesia"
        className="mt-5"
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              baixarCsv("mapa-freguesias.csv", [
                ["Freguesia", "Agregados", "Pessoas", "Cabazes entregues (mês)"],
                ...porFreguesia.map(([freguesia, dados]) => [
                  freguesia,
                  String(dados.agregados),
                  String(dados.pessoas),
                  String(dados.cabazes),
                ]),
              ])
            }
          >
            Exportar CSV
          </Button>
        }
      >
        <DataTable
          rowKey={([freguesia]) => freguesia}
          rows={porFreguesia}
          columns={[
            { header: "Freguesia", cell: ([freguesia]) => freguesia },
            { header: "Agregados", cell: ([, d]) => d.agregados, align: "right" },
            { header: "Pessoas apoiadas", cell: ([, d]) => d.pessoas, align: "right" },
            { header: "Cabazes este mês", cell: ([, d]) => d.cabazes, align: "right" },
          ]}
        />
      </Card>

      <Card title="Prestação de contas a financiadores" subtitle="Cartões Pingo Doce, por origem do fundo" className="mt-5">
        <DataTable
          rowKey={([origem]) => origem}
          rows={porFinanciador}
          columns={[
            { header: "Origem do fundo", cell: ([origem]) => origem },
            { header: "Cartões emitidos", cell: ([, d]) => d.cartoes, align: "right" },
            { header: "Valor total", cell: ([, d]) => formatCurrency(d.valor), align: "right" },
          ]}
        />
      </Card>

      <Card title="Exportação de dados individuais" className="mt-5">
        <label className="mb-3 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={anonimizar} onChange={(e) => setAnonimizar(e.target.checked)} />
          Exportar sem nomes (recomendado — secção 6.3, Proteção de dados)
        </label>
        <Button
          variant="secondary"
          onClick={() =>
            baixarCsv("agregados.csv", [
              ["Código", "Freguesia", "Nº pessoas", "Nº menores", "Situação habitacional", ...(anonimizar ? [] : ["Morada"])],
              ...db.agregados.map((a) => [
                a.codigo,
                a.freguesia,
                String(a.numPessoas),
                String(a.numMenores),
                a.situacaoHabitacional,
                ...(anonimizar ? [] : [a.morada]),
              ]),
            ])
          }
        >
          Exportar agregados (CSV)
        </Button>
      </Card>
    </div>
  );
}
