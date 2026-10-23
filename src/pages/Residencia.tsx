import { useState } from "react";
import { useDb } from "../store/db";
import { Button, Callout, Card, DataTable, Field, Input, Modal, SectionHeading, Select } from "../components/ui";
import { formatDate } from "../lib/format";
import { UNIDADES } from "../lib/unidades";
import { api } from "../services/api";

const NOVO_ARTIGO = "__novo__";

export function Residencia() {
  const { db, hasPerfil, executar } = useDb();
  const armazem = db.armazens.find((a) => a.codigo === "RES")!;
  const artigos = db.artigos.filter((a) => a.armazemId === armazem.id);
  const podeRegistar = hasPerfil("Direção", "Armazém", "Cozinha");

  const [modalEntrada, setModalEntrada] = useState(false);
  const [modalSaida, setModalSaida] = useState(false);
  const [artigoId, setArtigoId] = useState(artigos[0]?.id ?? NOVO_ARTIGO);
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
  const entradas = movimentos.filter((m) => m.tipo === "entrada");
  const saidas = movimentos.filter((m) => m.tipo === "saída");

  const disponivelArtigoAtual = db.lotes
    .filter((l) => l.artigoId === artigoId && l.estado === "disponível")
    .reduce((soma, l) => soma + l.quantidade, 0);
  const saidaInsuficiente = quantidade > disponivelArtigoAtual;

  async function registarEntrada() {
    if (ehNovoArtigo && !novoNome.trim()) return;
    // Um nome já existente neste armazém reutiliza o artigo (o servidor garante-o); não duplica.
    const resultado = await executar(() =>
      api.post<{ artigo: { id: string } }>("/existencias/entradas", {
        armazemId: armazem.id,
        ...(ehNovoArtigo
          ? { novoArtigo: { nome: novoNome.trim(), categoria: novaCategoria, unidade: novaUnidade, stockMinimo: novoStockMinimo } }
          : { artigoId }),
        quantidade,
        validade: validade || null,
        fornecedor: fornecedor || null,
      }),
    );
    if (!resultado) return;
    setModalEntrada(false);
    setArtigoId(resultado.artigo.id);
    setQuantidade(1);
    setValidade("");
    setFornecedor("");
    setNovoNome("");
  }

  async function registarSaida() {
    const resultado = await executar(() =>
      api.post("/existencias/saidas", { artigoId, quantidade, destino: "Casa da Caridade — cozinha" }),
    );
    if (!resultado) return;
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

      <Card title="Entradas" subtitle={armazem.designacao}>
        <DataTable
          rowKey={(m) => m.id}
          rows={entradas}
          emptyLabel="Sem entradas registadas."
          columns={[
            { header: "Data", cell: (m) => formatDate(m.data) },
            { header: "Artigo", cell: (m) => db.artigos.find((a) => a.id === m.artigoId)?.nome ?? "—" },
            { header: "Quantidade", cell: (m) => m.quantidade, align: "right" },
            { header: "Fornecedor", cell: (m) => <span className="text-ink-soft">{m.fornecedor ?? "—"}</span> },
            { header: "Registado por", cell: (m) => m.registadoPor },
          ]}
        />
      </Card>

      <Card title="Saídas" subtitle="Para a cozinha da Casa da Caridade" className="mt-5">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <Field label="Quantidade" hint={`Disponível: ${disponivelArtigoAtual}`}>
            <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} />
          </Field>
          {saidaInsuficiente && (
            <Callout tone="brick" title="Stock insuficiente">
              Só há {disponivelArtigoAtual} disponível deste artigo. Reduza a quantidade antes de
              confirmar.
            </Callout>
          )}
          <Button variant="primary" onClick={registarSaida} disabled={saidaInsuficiente || disponivelArtigoAtual <= 0}>
            Registar saída
          </Button>
        </div>
      </Modal>
    </div>
  );
}
