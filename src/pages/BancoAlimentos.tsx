import { useMemo, useState } from "react";
import { useDb } from "../store/db";
import {
  Badge,
  Button,
  Callout,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  Modal,
  SectionHeading,
  Select,
  estadoTone,
} from "../components/ui";
import { formatDate, diasAte } from "../lib/format";
import { newId } from "../lib/id";
import { UNIDADES } from "../lib/unidades";
import type { Artigo, EntregaCabaz, LinhaModeloCabaz, Lote, Movimento } from "../types";

type Tab = "montar" | "historico" | "modelos" | "entradas";

const ARMAZEM_CODIGO = "BSA";

export function BancoAlimentos() {
  const { db, currentUser, hasPerfil, addRecord, updateRecord } = useDb();
  const [tab, setTab] = useState<Tab>("montar");
  const podeGerirModelos = hasPerfil("Direção", "Técnico de ação social");
  const podeRegistarEntrada = hasPerfil("Direção", "Armazém");

  const armazem = db.armazens.find((a) => a.codigo === ARMAZEM_CODIGO)!;
  const artigosArmazem = db.artigos.filter((a) => a.armazemId === armazem.id);

  return (
    <div>
      <SectionHeading title="Banco Solidário de Alimentos" />

      <div className="mb-5 flex gap-1 rounded-lg border border-pine-900/15 bg-paper-raised p-1">
        {(
          [
            ["montar", "Montar cabaz"],
            ["historico", "Histórico"],
            ["modelos", "Modelos de cabaz"],
            ["entradas", "Entradas"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              tab === value ? "bg-pine-800 text-pine-50" : "text-ink-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "montar" && (
        <MontarCabaz
          artigosArmazem={artigosArmazem}
          registadoPor={currentUser.nome}
          onEntregar={(entrega, consumos) => {
            addRecord("entregasCabaz", entrega);
            consumos.forEach(({ lote, movimento }) => {
              updateRecord("lotes", lote.id, { quantidade: lote.quantidade });
              addRecord("movimentos", movimento);
            });
          }}
        />
      )}

      {tab === "historico" && <Historico />}

      {tab === "modelos" && <Modelos podeGerir={podeGerirModelos} artigosArmazem={artigosArmazem} />}

      {tab === "entradas" && (
        <Entradas
          podeRegistar={podeRegistarEntrada}
          artigosArmazem={artigosArmazem}
          armazemId={armazem.id}
          armazemDesignacao={armazem.designacao}
          registadoPor={currentUser.nome}
          onRegistar={(lote, movimento, novoArtigo) => {
            if (novoArtigo) addRecord("artigos", novoArtigo);
            addRecord("lotes", lote);
            addRecord("movimentos", movimento);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------- Montar cabaz

function escolherModeloPorTamanho(numPessoas: number, modelos: ReturnType<typeof useDb>["db"]["modelosCabaz"]) {
  const ativos = modelos.filter((m) => m.ativo && m.tipologia === "Semanal");
  if (numPessoas <= 1) return ativos.find((m) => m.nome.includes("Pessoa Só")) ?? ativos[0];
  if (numPessoas <= 4) return ativos.find((m) => m.nome.includes("até 4")) ?? ativos[0];
  return ativos.find((m) => m.nome.includes("5+")) ?? ativos[0];
}

function MontarCabaz({
  artigosArmazem,
  registadoPor,
  onEntregar,
}: {
  artigosArmazem: ReturnType<typeof useDb>["db"]["artigos"];
  registadoPor: string;
  onEntregar: (entrega: EntregaCabaz, consumos: { lote: Lote; movimento: Movimento }[]) => void;
}) {
  const { db } = useDb();
  const [agregadoId, setAgregadoId] = useState("");
  const [linhas, setLinhas] = useState<LinhaModeloCabaz[]>([]);
  const [modeloId, setModeloId] = useState("");
  const [confirmado, setConfirmado] = useState<string | null>(null);

  const agregado = db.agregados.find((a) => a.id === agregadoId) ?? null;
  const processo = agregado
    ? db.processos.find((p) => db.pessoas.find((pe) => pe.id === p.pessoaId)?.agregadoId === agregado.id)
    : null;
  const modelo = db.modelosCabaz.find((m) => m.id === modeloId) ?? null;

  function selecionarAgregado(idSel: string) {
    setAgregadoId(idSel);
    setConfirmado(null);
    const ag = db.agregados.find((a) => a.id === idSel);
    if (!ag) return;
    const sugerido = escolherModeloPorTamanho(ag.numPessoas, db.modelosCabaz);
    if (sugerido) {
      setModeloId(sugerido.id);
      setLinhas(sugerido.linhas.map((l) => ({ ...l })));
    }
  }

  function trocarModelo(idSel: string) {
    setModeloId(idSel);
    const m = db.modelosCabaz.find((mm) => mm.id === idSel);
    if (m) setLinhas(m.linhas.map((l) => ({ ...l })));
  }

  // Ganho extra: sugerir artigos do armazém com validade curta que ainda não estão no cabaz
  const sugestoesValidade = useMemo(() => {
    return db.lotes
      .filter((l) => {
        const artigo = artigosArmazem.find((a) => a.id === l.artigoId);
        if (!artigo || l.estado !== "disponível" || !l.validade || l.quantidade <= 0) return false;
        const dias = diasAte(l.validade);
        return dias >= 0 && dias <= 10 && !linhas.some((ln) => ln.artigoId === artigo.id);
      })
      .map((l) => ({ lote: l, artigo: artigosArmazem.find((a) => a.id === l.artigoId)! }))
      .slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.lotes, linhas, artigosArmazem]);

  function atualizarQuantidade(artigoId: string, quantidade: number) {
    setLinhas((prev) => prev.map((l) => (l.artigoId === artigoId ? { ...l, quantidade } : l)));
  }

  function removerLinha(artigoId: string) {
    setLinhas((prev) => prev.filter((l) => l.artigoId !== artigoId));
  }

  function adicionarSugestao(artigoId: string) {
    setLinhas((prev) => [...prev, { artigoId, quantidade: 1 }]);
  }

  function confirmarEntrega() {
    if (!agregado || !processo || !modelo) return;
    const consumos: { lote: Lote; movimento: Movimento }[] = [];

    for (const linha of linhas) {
      let restante = linha.quantidade;
      const lotesDisponiveis = db.lotes
        .filter((l) => l.artigoId === linha.artigoId && l.estado === "disponível" && l.quantidade > 0)
        .sort((a, b) => (a.validade ?? "9999").localeCompare(b.validade ?? "9999"));
      for (const lote of lotesDisponiveis) {
        if (restante <= 0) break;
        const retirar = Math.min(restante, lote.quantidade);
        const loteAtualizado = { ...lote, quantidade: lote.quantidade - retirar };
        consumos.push({
          lote: loteAtualizado,
          movimento: {
            id: newId("mov"),
            artigoId: linha.artigoId,
            loteId: lote.id,
            tipo: "saída",
            quantidade: retirar,
            data: new Date().toISOString().slice(0, 10),
            origemOuDestino: `Cabaz — Agregado ${agregado.codigo}`,
            fornecedor: null,
            benfeitor: null,
            documento: null,
            preco: null,
            registadoPor,
            referencia: agregado.codigo,
          },
        });
        restante -= retirar;
      }
    }

    onEntregar(
      {
        id: newId("ecb"),
        agregadoId: agregado.id,
        processoId: processo.id,
        tipo: "Semanal",
        modeloId: modelo.id,
        modeloVersao: modelo.versao,
        dataPrevista: new Date().toISOString().slice(0, 10),
        dataEfetiva: new Date().toISOString().slice(0, 10),
        levantadoPor: db.pessoas.find((p) => p.agregadoId === agregado.id)?.nome ?? null,
        registadoPor,
        estado: "Entregue",
        observacoes: "",
        linhas,
      },
      consumos
    );
    setConfirmado(agregado.codigo);
    setAgregadoId("");
    setLinhas([]);
    setModeloId("");
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card title="1. Escolher agregado" className="lg:col-span-1">
        <Field label="Agregado">
          <Select value={agregadoId} onChange={(e) => selecionarAgregado(e.target.value)}>
            <option value="">Selecionar…</option>
            {db.agregados.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo} · {a.numPessoas} pessoa(s)
              </option>
            ))}
          </Select>
        </Field>

        {agregado && (
          <div className="mt-4 space-y-1 text-sm text-ink-soft">
            <p>{agregado.numPessoas} pessoas · {agregado.numMenores} menores</p>
            <p>Freguesia: {agregado.freguesia}</p>
            {!processo && (
              <p className="mt-2 text-brick-600">
                Este agregado não tem processo ativo associado — não é possível confirmar a entrega.
              </p>
            )}
          </div>
        )}

        {modelo && (
          <div className="mt-4">
            <Field label="Modelo de cabaz">
              <Select value={modeloId} onChange={(e) => trocarModelo(e.target.value)}>
                {db.modelosCabaz
                  .filter((m) => m.ativo)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} (v{m.versao})
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        )}

        {confirmado && (
          <div className="mt-4">
            <Callout tone="pine" title="Entrega confirmada">
              Cabaz entregue ao agregado {confirmado} e existências atualizadas.
            </Callout>
          </div>
        )}
      </Card>

      <Card title="2. Ajustar o cabaz" className="lg:col-span-2">
        {!modelo ? (
          <p className="text-sm text-ink-soft">Escolha um agregado para o sistema sugerir o cabaz.</p>
        ) : (
          <>
            {linhas.length === 0 ? (
              <EmptyState message="Sem artigos no cabaz." />
            ) : (
              <div className="divide-y divide-pine-900/[0.06]">
                {linhas.map((l) => (
                  <div key={l.artigoId} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {db.artigos.find((a) => a.id === l.artigoId)?.nome ?? "—"}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={l.quantidade}
                      onChange={(e) => atualizarQuantidade(l.artigoId, Number(e.target.value))}
                      className="w-16 shrink-0 rounded-md border border-pine-900/15 bg-paper px-2 py-1 text-right text-sm"
                    />
                    <button
                      onClick={() => removerLinha(l.artigoId)}
                      className="shrink-0 text-xs text-ink-soft hover:text-brick-600"
                    >
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}

            {sugestoesValidade.length > 0 && (
              <div className="mt-4">
                <Callout tone="terracotta" title="Ganho extra — produtos a chegar ao fim do prazo">
                  <div className="mt-1 flex flex-wrap gap-2">
                    {sugestoesValidade.map(({ lote, artigo }) => (
                      <button
                        key={lote.id}
                        onClick={() => adicionarSugestao(artigo.id)}
                        className="rounded-full border border-terracotta-600/30 bg-terracotta-100 px-3 py-1 text-xs font-medium text-terracotta-700 hover:bg-terracotta-500 hover:text-white"
                      >
                        + {artigo.nome} (vence a {formatDate(lote.validade)})
                      </button>
                    ))}
                  </div>
                </Callout>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button variant="primary" disabled={!processo} onClick={confirmarEntrega}>
                Confirmar entrega
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------- Histórico

function Historico() {
  const { db } = useDb();
  const [filtroEstado, setFiltroEstado] = useState<string>("Todos");

  const linhas = db.entregasCabaz
    .filter((e) => filtroEstado === "Todos" || e.estado === filtroEstado)
    .sort((a, b) => b.dataPrevista.localeCompare(a.dataPrevista));

  return (
    <Card
      title="Histórico de entregas"
      actions={
        <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="w-44">
          <option>Todos</option>
          <option>Entregue</option>
          <option>Prevista</option>
          <option>Em falta</option>
          <option>Cancelada</option>
        </Select>
      }
    >
      <DataTable
        rowKey={(e) => e.id}
        rows={linhas}
        columns={[
          {
            header: "Agregado",
            cell: (e) => db.agregados.find((a) => a.id === e.agregadoId)?.codigo ?? "—",
          },
          { header: "Tipo", cell: (e) => e.tipo },
          { header: "Data prevista", cell: (e) => formatDate(e.dataPrevista) },
          { header: "Data efetiva", cell: (e) => formatDate(e.dataEfetiva) },
          { header: "Levantado por", cell: (e) => <span className="text-ink-soft">{e.levantadoPor ?? "—"}</span> },
          { header: "Estado", cell: (e) => <Badge tone={estadoTone(e.estado)}>{e.estado}</Badge> },
        ]}
      />
    </Card>
  );
}

// --------------------------------------------------------------------- Modelos

function Modelos({
  podeGerir,
  artigosArmazem,
}: {
  podeGerir: boolean;
  artigosArmazem: ReturnType<typeof useDb>["db"]["artigos"];
}) {
  const { db } = useDb();
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const aberto = db.modelosCabaz.find((m) => m.id === abertoId) ?? null;

  return (
    <Card title="Modelos de cabaz" subtitle="Cada modelo guarda a sua versão">
      <DataTable
        rowKey={(m) => m.id}
        rows={db.modelosCabaz}
        columns={[
          { header: "Nome", cell: (m) => m.nome },
          { header: "Tipologia", cell: (m) => m.tipologia },
          { header: "Versão", cell: (m) => `v${m.versao}`, align: "center" },
          { header: "Artigos", cell: (m) => m.linhas.length, align: "center" },
          { header: "Estado", cell: (m) => (m.ativo ? <Badge tone="pine">Ativo</Badge> : <Badge>Inativo</Badge>) },
          {
            header: "",
            align: "right",
            cell: (m) => (
              <Button variant="ghost" onClick={() => setAbertoId(m.id)}>
                Ver composição →
              </Button>
            ),
          },
        ]}
      />

      {aberto && (
        <Modal open onClose={() => setAbertoId(null)} title={`${aberto.nome} (v${aberto.versao})`}>
          <DataTable
            rowKey={(l) => l.artigoId}
            rows={aberto.linhas}
            columns={[
              { header: "Artigo", cell: (l) => db.artigos.find((a) => a.id === l.artigoId)?.nome ?? artigosArmazem.find(a=>a.id===l.artigoId)?.nome ?? "—" },
              { header: "Quantidade", cell: (l) => l.quantidade, align: "right" },
            ]}
          />
          {!podeGerir && (
            <p className="mt-4 text-xs text-ink-soft">
              A edição de modelos está reservada à Direção e à Técnica de ação social.
            </p>
          )}
        </Modal>
      )}
    </Card>
  );
}

// -------------------------------------------------------------------- Entradas

const NOVO_ARTIGO = "__novo__";

function Entradas({
  podeRegistar,
  artigosArmazem,
  armazemId,
  armazemDesignacao,
  registadoPor,
  onRegistar,
}: {
  podeRegistar: boolean;
  artigosArmazem: ReturnType<typeof useDb>["db"]["artigos"];
  armazemId: string;
  armazemDesignacao: string;
  registadoPor: string;
  onRegistar: (lote: Lote, movimento: Movimento, novoArtigo: Artigo | null) => void;
}) {
  const { db } = useDb();
  const [aberto, setAberto] = useState(false);
  const [artigoId, setArtigoId] = useState<string>(artigosArmazem[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState(1);
  const [validade, setValidade] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("Mercearia");
  const [novaUnidade, setNovaUnidade] = useState("un");
  const [novoStockMinimo, setNovoStockMinimo] = useState(5);

  const movimentosArmazem = db.movimentos
    .filter((m) => artigosArmazem.some((a) => a.id === m.artigoId) && m.tipo === "entrada")
    .sort((a, b) => b.data.localeCompare(a.data));

  const ehNovoArtigo = artigoId === NOVO_ARTIGO;

  function submeter() {
    let novoArtigo: Artigo | null = null;
    let idArtigoFinal = artigoId;

    if (ehNovoArtigo) {
      if (!novoNome.trim()) return;
      novoArtigo = {
        id: newId("art"),
        nome: novoNome.trim(),
        categoria: novaCategoria,
        unidade: novaUnidade,
        armazemId,
        stockMinimo: novoStockMinimo,
        consumivel: true,
      };
      idArtigoFinal = novoArtigo.id;
    }

    const lote: Lote = {
      id: newId("lot"),
      artigoId: idArtigoFinal,
      quantidade,
      validade: validade || null,
      localizacaoFisica: "Prateleira A",
      estado: "disponível",
      entrada: new Date().toISOString().slice(0, 10),
    };
    onRegistar(
      lote,
      {
        id: newId("mov"),
        artigoId: idArtigoFinal,
        loteId: lote.id,
        tipo: "entrada",
        quantidade,
        data: lote.entrada,
        origemOuDestino: armazemDesignacao,
        fornecedor: fornecedor || null,
        benfeitor: null,
        documento: null,
        preco: null,
        registadoPor,
        referencia: null,
      },
      novoArtigo
    );
    setAberto(false);
    setArtigoId(novoArtigo ? novoArtigo.id : artigosArmazem[0]?.id ?? "");
    setQuantidade(1);
    setValidade("");
    setFornecedor("");
    setNovoNome("");
  }

  return (
    <Card
      title="Entradas no armazém"
      subtitle={armazemDesignacao}
      actions={
        podeRegistar && (
          <Button variant="primary" onClick={() => setAberto(true)}>
            + Registar entrada
          </Button>
        )
      }
    >
      <DataTable
        rowKey={(m) => m.id}
        rows={movimentosArmazem.slice(0, 25)}
        columns={[
          { header: "Data", cell: (m) => formatDate(m.data) },
          { header: "Artigo", cell: (m) => db.artigos.find((a) => a.id === m.artigoId)?.nome ?? "—" },
          { header: "Quantidade", cell: (m) => m.quantidade, align: "right" },
          { header: "Fornecedor / benfeitor", cell: (m) => <span className="text-ink-soft">{m.fornecedor ?? m.benfeitor ?? "—"}</span> },
          { header: "Documento", cell: (m) => m.documento ?? "—" },
        ]}
      />

      <Modal open={aberto} onClose={() => setAberto(false)} title="Registar entrada">
        <div className="space-y-3">
          <Field label="Artigo">
            <Select value={artigoId} onChange={(e) => setArtigoId(e.target.value)}>
              {artigosArmazem.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
              <option value={NOVO_ARTIGO}>+ Novo artigo…</option>
            </Select>
          </Field>

          {ehNovoArtigo && (
            <div className="space-y-3 rounded-xl border border-pine-900/10 bg-pine-50/60 p-3">
              <Field label="Nome do novo artigo">
                <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="ex.: Molho de tomate 500g" autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoria">
                  <Input value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} />
                </Field>
                <Field label="Unidade" hint="Como se conta o artigo no armazém.">
                  <Select value={novaUnidade} onChange={(e) => setNovaUnidade(e.target.value)}>
                    {UNIDADES.map((u) => (
                      <option key={u.valor} value={u.valor}>
                        {u.rotulo}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Stock mínimo" hint="A partir de quanto o sistema avisa que está a acabar.">
                <Input
                  type="number"
                  min={0}
                  value={novoStockMinimo}
                  onChange={(e) => setNovoStockMinimo(Number(e.target.value))}
                />
              </Field>
            </div>
          )}

          <Field label="Quantidade">
            <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
          </Field>
          <Field label="Validade (opcional)">
            <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
          </Field>
          <Field label="Fornecedor / benfeitor">
            <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={submeter} disabled={ehNovoArtigo && !novoNome.trim()}>
            Registar
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
