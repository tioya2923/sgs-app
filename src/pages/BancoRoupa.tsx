import { useMemo, useState } from "react";
import { useDb } from "../store/db";
import { Button, Callout, Card, DataTable, Field, Input, Modal, SectionHeading, Select, SuggestInput, TabGroup } from "../components/ui";
import { formatDate } from "../lib/format";
import { newId } from "../lib/id";
import { sugestoesBenfeitores } from "../lib/sugestoes";
import type { Artigo, ItemRoupa, Lote, Movimento } from "../types";

const NOVO_ARTIGO = "__novo__";

type Tab = "entregas" | "entradas";

export function BancoRoupa() {
  const { db, currentUser, hasPerfil } = useDb();
  const [tab, setTab] = useState<Tab>("entregas");
  const podeRegistarEntrega = hasPerfil("Direção", "Técnico de ação social", "Voluntário — distribuição");
  const podeRegistarEntrada = hasPerfil("Direção", "Armazém", "Voluntário — distribuição");
  const armazem = db.armazens.find((a) => a.codigo === "BSR")!;
  const artigos = db.artigos.filter((a) => a.armazemId === armazem.id);

  return (
    <div>
      <SectionHeading title="Banco Solidário de Roupa" />

      <TabGroup
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "entregas", label: "Entregas por beneficiário" },
          { value: "entradas", label: "Entradas e saídas" },
        ]}
      />

      {tab === "entregas" && (
        <Entregas podeRegistar={podeRegistarEntrega} artigos={artigos} registadoPor={currentUser.nome} />
      )}

      {tab === "entradas" && (
        <Entradas
          podeRegistar={podeRegistarEntrada}
          artigos={artigos}
          armazemId={armazem.id}
          armazemDesignacao={armazem.designacao}
          registadoPor={currentUser.nome}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------- Entregas

function Entregas({
  podeRegistar,
  artigos,
  registadoPor,
}: {
  podeRegistar: boolean;
  artigos: ReturnType<typeof useDb>["db"]["artigos"];
  registadoPor: string;
}) {
  const { db, addRecord, updateRecord } = useDb();
  const [aberto, setAberto] = useState(false);
  const [processoId, setProcessoId] = useState(db.processos[0]?.id ?? "");
  const [itens, setItens] = useState<ItemRoupa[]>([{ tipo: artigos[0]?.nome ?? "", tamanho: "M", quantidade: 1, estado: "Bom estado" }]);

  const entregas = [...db.entregasRoupa].sort((a, b) => b.data.localeCompare(a.data));

  function atualizarItem(idx: number, patch: Partial<ItemRoupa>) {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  // Uma entrega de roupa também é uma saída de armazém — sem isto, o stock
  // nunca descia, e os alertas de "stock baixo/esgotado" de roupa nunca
  // refletiam o que realmente se deu às pessoas.
  function estoqueDisponivel(nomeArtigo: string): number {
    const artigo = artigos.find((a) => a.nome === nomeArtigo);
    if (!artigo) return 0;
    return db.lotes
      .filter((l) => l.artigoId === artigo.id && l.estado === "disponível")
      .reduce((soma, l) => soma + l.quantidade, 0);
  }

  // Duas linhas podem pedir o mesmo artigo (ex.: T-shirt tamanho M e tamanho
  // L) — o que sobra para cada linha tem de descontar o que as outras linhas
  // já reservaram, senão cada uma via o stock total como se fosse só sua.
  function disponivelParaLinha(idx: number): number {
    const item = itens[idx];
    const jaPedidoPorOutrasLinhas = itens.reduce(
      (soma, it, i) => (i !== idx && it.tipo === item.tipo ? soma + it.quantidade : soma),
      0
    );
    return estoqueDisponivel(item.tipo) - jaPedidoPorOutrasLinhas;
  }

  const itensInsuficientes = itens.filter((it, idx) => it.quantidade > disponivelParaLinha(idx));

  function submeter() {
    if (itensInsuficientes.length > 0) return;
    const processo = db.processos.find((p) => p.id === processoId);

    // Mapa de quantidades ainda por gastar em cada lote, atualizado à medida
    // que cada linha da entrega consome — sem isto, duas linhas do mesmo
    // artigo liam sempre a mesma quantidade "antes de gastar" e a segunda
    // sobrescrevia o desconto da primeira em vez de somar a ela.
    const restantePorLote = new Map(db.lotes.map((l) => [l.id, l.quantidade]));

    for (const item of itens) {
      const artigo = artigos.find((a) => a.nome === item.tipo);
      if (!artigo) continue;
      let restante = item.quantidade;
      const lotesDoArtigo = db.lotes
        .filter((l) => l.artigoId === artigo.id && l.estado === "disponível")
        .sort((a, b) => a.entrada.localeCompare(b.entrada));
      for (const lote of lotesDoArtigo) {
        if (restante <= 0) break;
        const disponivelNoLote = restantePorLote.get(lote.id) ?? 0;
        if (disponivelNoLote <= 0) continue;
        const retirar = Math.min(restante, disponivelNoLote);
        const novaQuantidade = disponivelNoLote - retirar;
        restantePorLote.set(lote.id, novaQuantidade);
        updateRecord("lotes", lote.id, { quantidade: novaQuantidade });
        addRecord("movimentos", {
          id: newId("mov"),
          artigoId: artigo.id,
          loteId: lote.id,
          tipo: "saída",
          quantidade: retirar,
          data: new Date().toISOString().slice(0, 10),
          origemOuDestino: `Entrega de roupa — processo nº ${processo?.numero ?? "—"}`,
          fornecedor: null,
          benfeitor: null,
          documento: null,
          preco: null,
          registadoPor,
          referencia: processo ? String(processo.numero) : null,
        });
        restante -= retirar;
      }
    }

    addRecord("entregasRoupa", {
      id: newId("erp"),
      processoId,
      data: new Date().toISOString().slice(0, 10),
      artigos: itens,
      registadoPor,
    });
    setAberto(false);
    setItens([{ tipo: artigos[0]?.nome ?? "", tamanho: "M", quantidade: 1, estado: "Bom estado" }]);
  }

  return (
    <>
      <Card
        title="Entregas por beneficiário"
        actions={
          podeRegistar && (
            <Button variant="primary" onClick={() => setAberto(true)}>
              + Registar entrega
            </Button>
          )
        }
      >
        <DataTable
          rowKey={(e) => e.id}
          rows={entregas}
          columns={[
            { header: "Data", cell: (e) => formatDate(e.data) },
            {
              header: "Beneficiário",
              cell: (e) => {
                const proc = db.processos.find((p) => p.id === e.processoId);
                return db.pessoas.find((p) => p.id === proc?.pessoaId)?.nome ?? "—";
              },
            },
            {
              header: "Artigos",
              cell: (e) => (
                <span className="text-ink-soft">
                  {e.artigos.map((a) => `${a.quantidade}× ${a.tipo}`).join(", ")}
                </span>
              ),
              className: "whitespace-normal",
            },
            { header: "Registado por", cell: (e) => e.registadoPor },
          ]}
        />
      </Card>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Registar entrega de roupa" width="max-w-xl">
        <div className="space-y-4">
          <Field label="Beneficiário (processo)">
            <Select value={processoId} onChange={(e) => setProcessoId(e.target.value)}>
              {db.processos.map((p) => (
                <option key={p.id} value={p.id}>
                  nº {p.numero} — {db.pessoas.find((pe) => pe.id === p.pessoaId)?.nome}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-2">
            {itens.map((item, idx) => {
              const disponivel = disponivelParaLinha(idx);
              const insuficiente = item.quantidade > disponivel;
              return (
                <div key={idx} className="rounded-lg border border-pine-900/10 p-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                    <Select value={item.tipo} onChange={(e) => atualizarItem(idx, { tipo: e.target.value })}>
                      {artigos.map((a) => (
                        <option key={a.id} value={a.nome}>
                          {a.nome}
                        </option>
                      ))}
                    </Select>
                    <Input
                      placeholder="Tamanho"
                      value={item.tamanho}
                      onChange={(e) => atualizarItem(idx, { tamanho: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) => atualizarItem(idx, { quantidade: Number(e.target.value) })}
                    />
                    <Select
                      value={item.estado}
                      onChange={(e) => atualizarItem(idx, { estado: e.target.value as ItemRoupa["estado"] })}
                    >
                      <option>Novo</option>
                      <option>Bom estado</option>
                      <option>Usado</option>
                    </Select>
                  </div>
                  <p className={`mt-1 text-xs ${insuficiente ? "font-medium text-brick-600" : "text-ink-soft"}`}>
                    disponível: {disponivel}
                  </p>
                </div>
              );
            })}
            <button
              className="text-xs font-medium text-pine-700 hover:underline"
              onClick={() => setItens((prev) => [...prev, { tipo: artigos[0]?.nome ?? "", tamanho: "M", quantidade: 1, estado: "Bom estado" }])}
            >
              + adicionar artigo
            </button>
          </div>

          {itensInsuficientes.length > 0 && (
            <Callout tone="brick" title="Stock insuficiente">
              Reduza a quantidade ou remova o artigo — o armazém não tem o suficiente para esta entrega.
            </Callout>
          )}

          <Button variant="primary" onClick={submeter} disabled={itensInsuficientes.length > 0}>
            Registar entrega
          </Button>
        </div>
      </Modal>
    </>
  );
}

// -------------------------------------------------------------- Entradas

function Entradas({
  podeRegistar,
  artigos,
  armazemId,
  armazemDesignacao,
  registadoPor,
}: {
  podeRegistar: boolean;
  artigos: ReturnType<typeof useDb>["db"]["artigos"];
  armazemId: string;
  armazemDesignacao: string;
  registadoPor: string;
}) {
  const { db, addRecord } = useDb();
  const [aberto, setAberto] = useState(false);
  const [artigoId, setArtigoId] = useState(artigos[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState(1);
  const [benfeitor, setBenfeitor] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("Vestuário adulto");
  const [novoStockMinimo, setNovoStockMinimo] = useState(5);

  const ehNovoArtigo = artigoId === NOVO_ARTIGO;

  const movimentosArmazem = db.movimentos
    .filter((m) => artigos.some((a) => a.id === m.artigoId))
    .sort((a, b) => b.data.localeCompare(a.data));
  const entradas = movimentosArmazem.filter((m) => m.tipo === "entrada");
  const saidas = movimentosArmazem.filter((m) => m.tipo === "saída");

  const sugestoesDoador = useMemo(() => sugestoesBenfeitores(entradas), [entradas]);

  function submeter() {
    let idArtigoFinal = artigoId;
    if (ehNovoArtigo) {
      const nomeNovo = novoNome.trim();
      if (!nomeNovo) return;
      // Um nome escrito de novo (espaço a mais, maiúscula diferente...) que já
      // existe neste armazém não deve virar um segundo artigo — isso partia o
      // stock em dois registos e desacertava os alertas de mínimo/esgotado.
      const existente = artigos.find((a) => a.nome.trim().toLowerCase() === nomeNovo.toLowerCase());
      if (existente) {
        idArtigoFinal = existente.id;
      } else {
        const novoArtigo: Artigo = {
          id: newId("art"),
          nome: nomeNovo,
          categoria: novaCategoria,
          unidade: "un",
          armazemId,
          stockMinimo: novoStockMinimo,
          consumivel: false,
        };
        addRecord("artigos", novoArtigo);
        idArtigoFinal = novoArtigo.id;
      }
    }

    const lote: Lote = {
      id: newId("lot"),
      artigoId: idArtigoFinal,
      quantidade,
      validade: null,
      localizacaoFisica: "Arrecadação",
      estado: "disponível",
      entrada: new Date().toISOString().slice(0, 10),
    };
    addRecord("lotes", lote);
    addRecord("movimentos", {
      id: newId("mov"),
      artigoId: idArtigoFinal,
      loteId: lote.id,
      tipo: "entrada",
      quantidade,
      data: lote.entrada,
      origemOuDestino: armazemDesignacao,
      fornecedor: null,
      benfeitor: benfeitor || null,
      documento: null,
      preco: null,
      registadoPor,
      referencia: null,
    } satisfies Movimento);

    setAberto(false);
    setArtigoId(idArtigoFinal);
    setQuantidade(1);
    setBenfeitor("");
    setNovoNome("");
  }

  return (
    <>
      <Card
        title="Entradas"
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
          rows={entradas}
          emptyLabel="Sem entradas registadas."
          columns={[
            { header: "Data", cell: (m) => formatDate(m.data) },
            { header: "Artigo", cell: (m) => db.artigos.find((a) => a.id === m.artigoId)?.nome ?? "—" },
            { header: "Quantidade", cell: (m) => m.quantidade, align: "right" },
            { header: "Doador", cell: (m) => <span className="text-ink-soft">{m.benfeitor ?? "—"}</span> },
          ]}
        />
      </Card>

      <Card title="Saídas" subtitle="Entregas a beneficiários" className="mt-5">
        <DataTable
          rowKey={(m) => m.id}
          rows={saidas}
          emptyLabel="Sem saídas registadas."
          columns={[
            { header: "Data", cell: (m) => formatDate(m.data) },
            { header: "Artigo", cell: (m) => db.artigos.find((a) => a.id === m.artigoId)?.nome ?? "—" },
            { header: "Quantidade", cell: (m) => m.quantidade, align: "right" },
            { header: "Destino", cell: (m) => <span className="text-ink-soft">{m.origemOuDestino}</span> },
            { header: "Registado por", cell: (m) => m.registadoPor },
          ]}
        />
      </Card>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Registar entrada">
        <div className="space-y-3">
          <Field label="Artigo">
            <Select value={artigoId} onChange={(e) => setArtigoId(e.target.value)}>
              {artigos.map((a) => (
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
                <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="ex.: Casaco de criança" autoFocus />
              </Field>
              <Field label="Categoria">
                <Select value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)}>
                  <option>Vestuário adulto</option>
                  <option>Vestuário infantil</option>
                  <option>Calçado</option>
                  <option>Casa</option>
                </Select>
              </Field>
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
          <Field label="Doador (opcional)" hint="Sugere nomes já usados, mas pode escrever um novo.">
            <SuggestInput value={benfeitor} onChange={setBenfeitor} suggestions={sugestoesDoador} />
          </Field>
          <Button variant="primary" onClick={submeter} disabled={ehNovoArtigo && !novoNome.trim()}>
            Registar
          </Button>
        </div>
      </Modal>
    </>
  );
}
