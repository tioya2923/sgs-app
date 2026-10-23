import { useEffect, useState } from "react";
import { Button, Card, DataTable, SectionHeading, StatTile } from "../components/ui";
import { formatCurrency } from "../lib/format";
import { ApiError, api, descarregar } from "../services/api";

interface Resumo {
  cabazesMes: number;
  refeicoesMes: number;
  roupaMes: number;
  novosProcessosMes: number;
  porFreguesia: { freguesia: string; agregados: number; pessoas: number; cabazes: number }[];
  porFinanciador: { origem: string; cartoes: number; valor: number }[];
}

export function Relatorios() {
  const [anonimizar, setAnonimizar] = useState(true);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Os números são calculados no servidor, a partir de todos os dados — o perfil
  // Administrativo não recebe fichas individuais, só os agregados do relatório.
  useEffect(() => {
    let ativo = true;
    api
      .get<Resumo>("/relatorios/resumo")
      .then((r) => ativo && setResumo(r))
      .catch((e) => ativo && setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os relatórios."));
    return () => {
      ativo = false;
    };
  }, []);

  async function exportar(caminho: string, ficheiro: string) {
    setErro(null);
    try {
      await descarregar(caminho, ficheiro);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível exportar.");
    }
  }

  if (erro && !resumo) return <p role="alert" className="text-sm text-brick-700">{erro}</p>;
  if (!resumo) return <p className="text-sm text-ink-soft">A carregar relatórios…</p>;

  return (
    <div>
      <SectionHeading title="Relatórios" />

      {erro && <p role="alert" className="mb-4 rounded-lg bg-brick-50 px-3 py-2 text-sm text-brick-700">{erro}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Cabazes este mês" value={resumo.cabazesMes} tone="pine" />
        <StatTile label="Refeições este mês" value={resumo.refeicoesMes} tone="gold" />
        <StatTile label="Entregas de roupa" value={resumo.roupaMes} tone="neutral" />
        <StatTile label="Novos processos" value={resumo.novosProcessosMes} tone="terracotta" />
      </div>

      <Card
        title="Mapa por freguesia"
        className="mt-5"
        actions={
          <Button variant="secondary" onClick={() => exportar("/relatorios/mapa-freguesias.csv", "mapa-freguesias.csv")}>
            Exportar CSV
          </Button>
        }
      >
        <DataTable
          rowKey={(d) => d.freguesia}
          rows={resumo.porFreguesia}
          columns={[
            { header: "Freguesia", cell: (d) => d.freguesia },
            { header: "Agregados", cell: (d) => d.agregados, align: "right" },
            { header: "Pessoas apoiadas", cell: (d) => d.pessoas, align: "right" },
            { header: "Cabazes este mês", cell: (d) => d.cabazes, align: "right" },
          ]}
        />
      </Card>

      <Card title="Prestação de contas a financiadores" subtitle="Cartões Pingo Doce, por origem do fundo" className="mt-5">
        <DataTable
          rowKey={(d) => d.origem}
          rows={resumo.porFinanciador}
          columns={[
            { header: "Origem do fundo", cell: (d) => d.origem },
            { header: "Cartões emitidos", cell: (d) => d.cartoes, align: "right" },
            { header: "Valor total", cell: (d) => formatCurrency(d.valor), align: "right" },
          ]}
        />
      </Card>

      <Card title="Exportação de dados individuais" className="mt-5">
        <label className="mb-3 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={anonimizar} onChange={(e) => setAnonimizar(e.target.checked)} />
          Exportar sem moradas (recomendado)
        </label>
        <Button
          variant="secondary"
          onClick={() => exportar(`/relatorios/agregados.csv?anonimizar=${anonimizar}`, "agregados.csv")}
        >
          Exportar agregados (CSV)
        </Button>
        <p className="mt-3 text-xs text-ink-soft">Todas as exportações ficam registadas no registo de acessos.</p>
      </Card>
    </div>
  );
}
