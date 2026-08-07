import { useState } from "react";
import { useDb } from "../store/db";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  SectionHeading,
  Select,
  tipoMovimentoTone,
} from "../components/ui";
import { formatDate } from "../lib/format";
import { newId } from "../lib/id";
import { UNIDADES } from "../lib/unidades";
import type { RefeicaoContagem, RefeicaoPresenca, Turno } from "../types";

type Tab = "contagem" | "presencas" | "entradas";

export function CasaCaridade() {
  const { db, currentUser, hasPerfil, addRecord } = useDb();
  const [tab, setTab] = useState<Tab>("contagem");
  const podeRegistar = hasPerfil("Direção", "Técnico de ação social", "Cozinha");
  const armazem = db.armazens.find((a) => a.codigo === "CDC")!;
  const artigos = db.artigos.filter((a) => a.armazemId === armazem.id);

  return (
    <div>
      <SectionHeading title="Casa da Caridade" />

      <div className="mb-5 flex gap-1 rounded-lg border border-pine-900/15 bg-paper-raised p-1">
        {(
          [
            ["contagem", "Contagem de refeições"],
            ["presencas", "Presenças nominais"],
            ["entradas", "Entradas e consumíveis"],
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

      {tab === "contagem" && (
        <Contagem podeRegistar={podeRegistar} onAdicionar={(c) => addRecord("refeicoesContagem", c)} />
      )}
      {tab === "presencas" && (
        <Presencas
          podeRegistar={podeRegistar}
          registadoPor={currentUser.nome}
          onMarcar={(p) => addRecord("refeicoesPresenca", p)}
        />
      )}
      {tab === "entradas" && (
        <EntradasConsumiveis artigos={artigos} armazemId={armazem.id} armazemDesignacao={armazem.designacao} />
      )}
    </div>
  );
}

function Contagem({
  podeRegistar,
  onAdicionar,
}: {
  podeRegistar: boolean;
  onAdicionar: (c: RefeicaoContagem) => void;
}) {
  const { db } = useDb();
  const [aberto, setAberto] = useState(false);
  const [turno, setTurno] = useState<Turno>("Almoço");
  const [campos, setCampos] = useState({
    numPessoas: 0,
    sopas: 0,
    pratos: 0,
    alternativaVegetariana: 0,
    sobremesas: 0,
    pao: 0,
    aguas: 0,
    takeaway: 0,
  });

  const contagens = [...db.refeicoesContagem].sort((a, b) => b.data.localeCompare(a.data));

  function submeter() {
    onAdicionar({
      id: newId("rfc"),
      data: new Date().toISOString().slice(0, 10),
      turno,
      ...campos,
    });
    setAberto(false);
    setCampos({
      numPessoas: 0,
      sopas: 0,
      pratos: 0,
      alternativaVegetariana: 0,
      sobremesas: 0,
      pao: 0,
      aguas: 0,
      takeaway: 0,
    });
  }

  return (
    <Card
      title="Contagens por dia e turno"
      actions={
        podeRegistar && (
          <Button variant="primary" onClick={() => setAberto(true)}>
            + Registar contagem
          </Button>
        )
      }
    >
      <DataTable
        rowKey={(c) => c.id}
        rows={contagens}
        columns={[
          { header: "Data", cell: (c) => formatDate(c.data) },
          { header: "Turno", cell: (c) => c.turno },
          { header: "Pessoas", cell: (c) => c.numPessoas, align: "right" },
          { header: "Sopas", cell: (c) => c.sopas, align: "right" },
          { header: "Pratos", cell: (c) => c.pratos, align: "right" },
          { header: "Vegetariana", cell: (c) => c.alternativaVegetariana, align: "right" },
          { header: "Sobremesas", cell: (c) => c.sobremesas, align: "right" },
          { header: "Pão", cell: (c) => c.pao, align: "right" },
          { header: "Águas", cell: (c) => c.aguas, align: "right" },
          { header: "Take-away", cell: (c) => c.takeaway, align: "right" },
        ]}
      />

      <Modal open={aberto} onClose={() => setAberto(false)} title="Registar contagem de refeição">
        <div className="space-y-3">
          <Field label="Turno">
            <Select value={turno} onChange={(e) => setTurno(e.target.value as Turno)}>
              <option>Almoço</option>
              <option>Jantar</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["numPessoas", "Nº de pessoas"],
                ["sopas", "Sopas"],
                ["pratos", "Pratos"],
                ["alternativaVegetariana", "Alt. vegetariana"],
                ["sobremesas", "Sobremesas"],
                ["pao", "Pão"],
                ["aguas", "Águas"],
                ["takeaway", "Take-away"],
              ] as [keyof typeof campos, string][]
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <Input
                  type="number"
                  min={0}
                  value={campos[key]}
                  onChange={(e) => setCampos((c) => ({ ...c, [key]: Number(e.target.value) }))}
                />
              </Field>
            ))}
          </div>
          <Button variant="primary" onClick={submeter}>
            Guardar
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function Presencas({
  podeRegistar,
  registadoPor,
  onMarcar,
}: {
  podeRegistar: boolean;
  registadoPor: string;
  onMarcar: (p: RefeicaoPresenca) => void;
}) {
  const { db } = useDb();
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [turno, setTurno] = useState<Turno>("Almoço");

  const processosAcompanhados = db.processos.filter((p) => p.estado === "Ativo");
  const presencaPorProcesso = new Map(
    db.refeicoesPresenca.filter((p) => p.data === data && p.turno === turno).map((p) => [p.processoId, p])
  );

  return (
    <Card title="Presenças nominais dos processos em acompanhamento">
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Data">
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Turno">
          <Select value={turno} onChange={(e) => setTurno(e.target.value as Turno)}>
            <option>Almoço</option>
            <option>Jantar</option>
          </Select>
        </Field>
      </div>

      <DataTable
        rowKey={(p) => p.id}
        rows={processosAcompanhados}
        columns={[
          {
            header: "Pessoa",
            cell: (p) => db.pessoas.find((pe) => pe.id === p.pessoaId)?.nome ?? "—",
          },
          { header: "Nº processo", cell: (p) => p.numero, align: "center" },
          {
            header: "Presença",
            align: "center",
            cell: (p) => {
              const presenca = presencaPorProcesso.get(p.id);
              if (!presenca) return <Badge tone="neutral">Não marcado</Badge>;
              return (
                <Badge tone="pine">{presenca.modalidade === "Take-away" ? "Take-away" : "Presencial"}</Badge>
              );
            },
          },
          {
            header: "",
            align: "right",
            cell: (p) =>
              podeRegistar &&
              !presencaPorProcesso.has(p.id) && (
                <div className="flex justify-end gap-1.5">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      onMarcar({
                        id: newId("rfp"),
                        data,
                        turno,
                        processoId: p.id,
                        modalidade: "Presencial",
                        numDoses: 1,
                      })
                    }
                  >
                    Presencial
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onMarcar({
                        id: newId("rfp"),
                        data,
                        turno,
                        processoId: p.id,
                        modalidade: "Take-away",
                        numDoses: 1,
                      })
                    }
                  >
                    Take-away
                  </Button>
                </div>
              ),
          },
        ]}
      />
      <p className="mt-3 text-xs text-ink-soft">Registado por {registadoPor}</p>
    </Card>
  );
}

const NOVO_ARTIGO = "__novo__";

function EntradasConsumiveis({
  artigos,
  armazemId,
  armazemDesignacao,
}: {
  artigos: ReturnType<typeof useDb>["db"]["artigos"];
  armazemId: string;
  armazemDesignacao: string;
}) {
  const { db, currentUser, hasPerfil, addRecord } = useDb();
  const podeRegistar = hasPerfil("Direção", "Armazém", "Cozinha");
  const [aberto, setAberto] = useState(false);
  const [artigoId, setArtigoId] = useState(artigos[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState(1);
  const [novoNome, setNovoNome] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("Consumível");
  const [novaUnidade, setNovaUnidade] = useState("un");
  const [novoStockMinimo, setNovoStockMinimo] = useState(5);
  const ehNovoArtigo = artigoId === NOVO_ARTIGO;

  const movimentos = db.movimentos
    .filter((m) => artigos.some((a) => a.id === m.artigoId))
    .sort((a, b) => b.data.localeCompare(a.data));

  return (
    <Card
      title="Entradas e consumíveis"
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
          { header: "Tipo", cell: (m) => <Badge tone={tipoMovimentoTone(m.tipo)}>{m.tipo}</Badge> },
          { header: "Quantidade", cell: (m) => m.quantidade, align: "right" },
          { header: "Origem", cell: (m) => <span className="text-ink-soft">{m.fornecedor ?? m.origemOuDestino}</span> },
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
                <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="ex.: Sacos de lixo 50L" autoFocus />
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
          <Button
            variant="primary"
            disabled={ehNovoArtigo && !novoNome.trim()}
            onClick={() => {
              let idArtigoFinal = artigoId;
              if (ehNovoArtigo) {
                if (!novoNome.trim()) return;
                idArtigoFinal = newId("art");
                addRecord("artigos", {
                  id: idArtigoFinal,
                  nome: novoNome.trim(),
                  categoria: novaCategoria,
                  unidade: novaUnidade,
                  armazemId,
                  stockMinimo: novoStockMinimo,
                  consumivel: true,
                });
              }

              const loteId = newId("lot");
              addRecord("lotes", {
                id: loteId,
                artigoId: idArtigoFinal,
                quantidade,
                validade: null,
                localizacaoFisica: "Copa",
                estado: "disponível",
                entrada: new Date().toISOString().slice(0, 10),
              });
              addRecord("movimentos", {
                id: newId("mov"),
                artigoId: idArtigoFinal,
                loteId,
                tipo: "entrada",
                quantidade,
                data: new Date().toISOString().slice(0, 10),
                origemOuDestino: armazemDesignacao,
                fornecedor: null,
                benfeitor: null,
                documento: null,
                preco: null,
                registadoPor: currentUser.nome,
                referencia: null,
              });
              setAberto(false);
              setArtigoId(idArtigoFinal);
              setQuantidade(1);
              setNovoNome("");
            }}
          >
            Registar
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
