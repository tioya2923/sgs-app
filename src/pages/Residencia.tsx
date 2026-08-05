import { useState } from "react";
import { useDb } from "../store/db";
import { Button, Card, DataTable, Field, Input, Modal, SectionHeading, Select } from "../components/ui";
import { formatDate } from "../lib/format";
import { newId } from "../lib/id";
import { UNIDADES } from "../lib/unidades";
import type { Artigo, Lote, Movimento } from "../types";

const NOVO_ARTIGO = "__novo__";

export function Residencia() {
  const { db, currentUser, hasPerfil, addRecord, updateRecord } = useDb();
  const armazem = db.armazens.find((a) => a.codigo === "RES")!;
  const artigos = db.artigos.filter((a) => a.armazemId === armazem.id);
  const podeRegistar = hasPerfil("Direção", "Armazém", "Cozinha");

  const [modalEntrada, setModalEntrada] = useState(false);
  const [modalSaida, setModalSaida] = useState(false);
  const [artigoId, setArtigoId] = useState(artigos[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState(1);
  const [validade, setValidade] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("Mercearia");
  const [novaUnidade, setNovaUnidade] = useState("un");
  const [novoStockMinimo, setNovoStockMinimo] = useState(5);

  const ehNovoArtigo = artigoId === NOVO_ARTIGO;

  const movimentos = db.movimentos
    .filter((m) => artigos.some((a) => a.id === m.artigoId))
    .sort((a, b) => b.data.localeCompare(a.data));

  function registarEntrada() {
    let idArtigoFinal = artigoId;
    if (ehNovoArtigo) {
      if (!novoNome.trim()) return;
      const novoArtigo: Artigo = {
        id: newId("art"),
        nome: novoNome.trim(),
        categoria: novaCategoria,
        unidade: novaUnidade,
        armazemId: armazem.id,
        stockMinimo: novoStockMinimo,
        consumivel: true,
      };
      addRecord("artigos", novoArtigo);
      idArtigoFinal = novoArtigo.id;
    }

    const lote: Lote = {
      id: newId("lot"),
      artigoId: idArtigoFinal,
      quantidade,
      validade: validade || null,
      localizacaoFisica: "Arca / prateleira",
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
      origemOuDestino: armazem.designacao,
      fornecedor: fornecedor || null,
      benfeitor: null,
      documento: null,
      preco: null,
      registadoPor: currentUser.nome,
      referencia: null,
    } satisfies Movimento);
    setModalEntrada(false);
    setArtigoId(idArtigoFinal);
    setQuantidade(1);
    setValidade("");
    setFornecedor("");
    setNovoNome("");
  }

  function registarSaida() {
    let restante = quantidade;
    const lotesDisponiveis = db.lotes
      .filter((l) => l.artigoId === artigoId && l.estado === "disponível" && l.quantidade > 0)
      .sort((a, b) => (a.validade ?? "9999").localeCompare(b.validade ?? "9999"));
    for (const lote of lotesDisponiveis) {
      if (restante <= 0) break;
      const retirar = Math.min(restante, lote.quantidade);
      updateRecord("lotes", lote.id, { quantidade: lote.quantidade - retirar });
      addRecord("movimentos", {
        id: newId("mov"),
        artigoId,
        loteId: lote.id,
        tipo: "saída",
        quantidade: retirar,
        data: new Date().toISOString().slice(0, 10),
        origemOuDestino: "Casa da Caridade — cozinha",
        fornecedor: null,
        benfeitor: null,
        documento: null,
        preco: null,
        registadoPor: currentUser.nome,
        referencia: null,
      } satisfies Movimento);
      restante -= retirar;
    }
    setModalSaida(false);
    setQuantidade(1);
  }

  return (
    <div>
      <SectionHeading
        title="Residência"
        actions={
          podeRegistar && (
            <>
              <Button variant="secondary" onClick={() => setModalEntrada(true)}>
                + Entrada
              </Button>
              <Button variant="primary" onClick={() => setModalSaida(true)}>
                + Saída para cozinha
              </Button>
            </>
          )
        }
      />

      <Card title="Movimentos" subtitle={armazem.designacao}>
        <DataTable
          rowKey={(m) => m.id}
          rows={movimentos}
          columns={[
            { header: "Data", cell: (m) => formatDate(m.data) },
            { header: "Tipo", cell: (m) => m.tipo },
            { header: "Artigo", cell: (m) => db.artigos.find((a) => a.id === m.artigoId)?.nome ?? "—" },
            { header: "Quantidade", cell: (m) => m.quantidade, align: "right" },
            { header: "Destino / origem", cell: (m) => <span className="text-ink-soft">{m.origemOuDestino}</span> },
            { header: "Registado por", cell: (m) => m.registadoPor },
          ]}
        />
      </Card>

      <Modal open={modalEntrada} onClose={() => setModalEntrada(false)} title="Registar entrada">
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
          <Field label="Fornecedor">
            <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={registarEntrada} disabled={ehNovoArtigo && !novoNome.trim()}>
            Registar
          </Button>
        </div>
      </Modal>

      <Modal open={modalSaida} onClose={() => setModalSaida(false)} title="Saída para a cozinha">
        <div className="space-y-3">
          <Field label="Artigo">
            <Select value={artigoId} onChange={(e) => setArtigoId(e.target.value)}>
              {artigos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantidade">
            <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
          </Field>
          <Button variant="primary" onClick={registarSaida}>
            Registar saída
          </Button>
        </div>
      </Modal>
    </div>
  );
}
