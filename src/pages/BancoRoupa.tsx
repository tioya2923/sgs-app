import { useState } from "react";
import { useDb } from "../store/db";
import { Button, Card, DataTable, Field, Input, Modal, SectionHeading, Select } from "../components/ui";
import { formatDate } from "../lib/format";
import { newId } from "../lib/id";
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

      <div className="mb-5 flex gap-1 rounded-lg border border-pine-900/15 bg-paper-raised p-1">
        {(
          [
            ["entregas", "Entregas por beneficiário"],
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
  const { db, addRecord } = useDb();
  const [aberto, setAberto] = useState(false);
  const [processoId, setProcessoId] = useState(db.processos[0]?.id ?? "");
  const [itens, setItens] = useState<ItemRoupa[]>([{ tipo: artigos[0]?.nome ?? "", tamanho: "M", quantidade: 1, estado: "Bom estado" }]);

  const entregas = [...db.entregasRoupa].sort((a, b) => b.data.localeCompare(a.data));

  function atualizarItem(idx: number, patch: Partial<ItemRoupa>) {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function submeter() {
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
            {itens.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 rounded-lg border border-pine-900/10 p-2">
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
            ))}
            <button
              className="text-xs font-medium text-pine-700 hover:underline"
              onClick={() => setItens((prev) => [...prev, { tipo: artigos[0]?.nome ?? "", tamanho: "M", quantidade: 1, estado: "Bom estado" }])}
            >
              + adicionar artigo
            </button>
          </div>

          <Button variant="primary" onClick={submeter}>
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

  const movimentos = db.movimentos
    .filter((m) => artigos.some((a) => a.id === m.artigoId) && m.tipo === "entrada")
    .sort((a, b) => b.data.localeCompare(a.data));

  function submeter() {
    let idArtigoFinal = artigoId;
    if (ehNovoArtigo) {
      if (!novoNome.trim()) return;
      const novoArtigo: Artigo = {
        id: newId("art"),
        nome: novoNome.trim(),
        categoria: novaCategoria,
        unidade: "un",
        armazemId,
        stockMinimo: novoStockMinimo,
        consumivel: false,
      };
      addRecord("artigos", novoArtigo);
      idArtigoFinal = novoArtigo.id;
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
        rows={movimentos}
        columns={[
          { header: "Data", cell: (m) => formatDate(m.data) },
          { header: "Artigo", cell: (m) => db.artigos.find((a) => a.id === m.artigoId)?.nome ?? "—" },
          { header: "Quantidade", cell: (m) => m.quantidade, align: "right" },
          { header: "Doador", cell: (m) => <span className="text-ink-soft">{m.benfeitor ?? "—"}</span> },
        ]}
      />

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
          <Field label="Doador (opcional)">
            <Input value={benfeitor} onChange={(e) => setBenfeitor(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={submeter} disabled={ehNovoArtigo && !novoNome.trim()}>
            Registar
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
