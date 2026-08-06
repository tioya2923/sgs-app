import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useDb } from "../store/db";
import { alertaVisivel, computeAlertas } from "../lib/alerts";
import { moduloVisivel, podeAceder } from "../lib/nav";
import { Badge, Card, DataTable, SectionHeading, StatTile, gravidadeTone } from "../components/ui";
import { formatDate, formatDateLong } from "../lib/format";

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function inicioMesISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function Painel() {
  const { db, currentUser } = useDb();
  const perfil = currentUser.perfil;
  const hoje = hojeISO();
  const inicioMes = inicioMesISO();

  // O painel só mostra o que cada perfil já pode ver noutro lado — cada
  // bloco espelha o acesso do módulo de onde os dados vêm (lib/nav.ts), e os
  // casos individuais (nomes de pessoas) ficam reservados a quem vê
  // "processos completos" (secção 6.1), tal como os alertas automáticos.
  const veCasos = podeAceder(perfil, ["Direção", "Técnico de ação social"]);
  const veBancoAlimentos = moduloVisivel("/banco-alimentos", perfil);
  const veResidencia = moduloVisivel("/residencia", perfil);
  const veCasaCaridade = moduloVisivel("/casa-caridade", perfil);
  const veBancoRoupa = moduloVisivel("/banco-roupa", perfil);
  const veExistencias = moduloVisivel("/existencias", perfil);
  const veCartoes = moduloVisivel("/cartoes", perfil);
  const veEntradasGeral = veBancoAlimentos || veResidencia || veCasaCaridade || veBancoRoupa;
  const veEstatisticasMes = veBancoAlimentos || veCasaCaridade || veCasos;

  const alertas = useMemo(
    () => computeAlertas(db).filter((a) => alertaVisivel(a, perfil)),
    [db, perfil]
  );
  const alertasAtivos = alertas.filter((a) => a.estado === "Ativo");

  const atendimentosHoje = db.atendimentos.filter((a) => a.data === hoje);
  const cabazesHoje = db.entregasCabaz.filter((e) => e.dataPrevista === hoje);
  const roupaHoje = db.entregasRoupa.filter((e) => e.data === hoje);
  const entradasHoje = db.movimentos.filter((m) => m.tipo === "entrada" && m.data === hoje);
  const refeicoesHoje = db.refeicoesContagem.filter((r) => r.data === hoje);
  const totalRefeicoesHoje = refeicoesHoje.reduce((s, r) => s + r.numPessoas, 0);
  const cartoesPorEntregar = db.cartoes.filter((c) => c.estado === "Por entregar").length;

  const cabazesMes = db.entregasCabaz.filter(
    (e) => e.dataPrevista >= inicioMes && e.estado === "Entregue"
  ).length;
  const refeicoesMes = db.refeicoesContagem
    .filter((r) => r.data >= inicioMes)
    .reduce((s, r) => s + r.numPessoas, 0);
  const pessoasComProcesso = db.processos.filter((p) => p.estado === "Ativo").length;
  const totalApoiados = db.pessoas.length;

  return (
    <div>
      <SectionHeading
        eyebrow={formatDateLong(hoje)}
        title={`Bom dia, ${currentUser.nome.split(" ")[0]}`}
        subtitle="Resumo do dia — atendimentos, cabazes, refeições, roupa, entradas, alertas e estatísticas do mês."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {veCasos && <StatTile label="Atendimentos hoje" value={atendimentosHoje.length} tone="pine" />}
        {veBancoAlimentos && (
          <StatTile
            label="Cabazes hoje"
            value={`${cabazesHoje.filter((c) => c.estado === "Entregue").length}/${cabazesHoje.length}`}
            hint="entregues / previstos"
            tone="terracotta"
          />
        )}
        {veCasaCaridade && <StatTile label="Refeições hoje" value={totalRefeicoesHoje} tone="gold" />}
        {veBancoRoupa && <StatTile label="Roupa hoje" value={roupaHoje.length} tone="neutral" />}
        {veEntradasGeral && <StatTile label="Entradas hoje" value={entradasHoje.length} tone="pine" />}
        {veCartoes && <StatTile label="Cartões por entregar" value={cartoesPorEntregar} tone="terracotta" />}
        <StatTile
          label="Alertas ativos"
          value={alertasAtivos.length}
          hint={`${alertasAtivos.filter((a) => a.gravidade === "Urgente").length} urgentes`}
          tone={alertasAtivos.some((a) => a.gravidade === "Urgente") ? "brick" : "neutral"}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card
          title="Alertas por tratar"
          className="lg:col-span-2"
          actions={
            <Link to="/alertas" className="text-sm font-medium text-pine-700 hover:underline">
              Ver todos →
            </Link>
          }
        >
          <DataTable
            emptyLabel="Sem alertas ativos neste momento."
            rowKey={(a) => a.id}
            rows={alertasAtivos.slice(0, 6)}
            columns={[
              {
                header: "Gravidade",
                cell: (a) => <Badge tone={gravidadeTone(a.gravidade)}>{a.gravidade}</Badge>,
              },
              { header: "Tipo", cell: (a) => a.tipo },
              { header: "Entidade", cell: (a) => <span className="text-ink-soft">{a.entidade}</span> },
            ]}
          />
        </Card>

        {veEstatisticasMes && (
          <Card title="Estatísticas do mês" subtitle="Desde o dia 1">
            <dl className="space-y-3 text-sm">
              {veBancoAlimentos && (
                <div className="flex items-center justify-between">
                  <dt className="text-ink-soft">Cabazes entregues</dt>
                  <dd className="font-display text-lg text-ink">{cabazesMes}</dd>
                </div>
              )}
              {veCasaCaridade && (
                <div className="flex items-center justify-between">
                  <dt className="text-ink-soft">Refeições servidas</dt>
                  <dd className="font-display text-lg text-ink">{refeicoesMes}</dd>
                </div>
              )}
              {veCasos && (
                <>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-soft">Processos ativos</dt>
                    <dd className="font-display text-lg text-ink">{pessoasComProcesso}</dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-pine-900/10 pt-3">
                    <dt className="text-ink-soft">Pessoas apoiadas (total)</dt>
                    <dd className="font-display text-lg text-ink">{totalApoiados}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-soft">Agregados</dt>
                    <dd className="font-display text-lg text-ink">{db.agregados.length}</dd>
                  </div>
                </>
              )}
            </dl>
          </Card>
        )}
      </div>

      {(veCasos || veExistencias) && (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {veCasos && (
            <Card title="Atendimentos de hoje" subtitle="Porta Aberta">
              <DataTable
                emptyLabel="Sem atendimentos registados hoje."
                rowKey={(a) => a.id}
                rows={atendimentosHoje}
                columns={[
                  {
                    header: "Pessoa",
                    cell: (a) => {
                      const proc = db.processos.find((p) => p.id === a.processoId);
                      const pessoa = db.pessoas.find((p) => p.id === proc?.pessoaId);
                      return pessoa?.nome ?? "—";
                    },
                  },
                  { header: "Tipo", cell: (a) => a.tipo },
                  { header: "Técnico", cell: (a) => <span className="text-ink-soft">{a.tecnico}</span> },
                ]}
              />
            </Card>
          )}

          {veExistencias && (
            <Card title="Entradas de hoje" subtitle="Existências">
              <DataTable
                emptyLabel="Sem entradas registadas hoje."
                rowKey={(m) => m.id}
                rows={entradasHoje}
                columns={[
                  {
                    header: "Artigo",
                    cell: (m) => db.artigos.find((a) => a.id === m.artigoId)?.nome ?? "—",
                  },
                  { header: "Quantidade", cell: (m) => m.quantidade, align: "right" },
                  {
                    header: "Origem",
                    cell: (m) => <span className="text-ink-soft">{m.fornecedor ?? m.benfeitor ?? "—"}</span>,
                  },
                ]}
              />
            </Card>
          )}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-ink-soft">
        Dados de demonstração · última atualização {formatDate(hoje)}
      </p>
    </div>
  );
}
