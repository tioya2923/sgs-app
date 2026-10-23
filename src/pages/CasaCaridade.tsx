import { useState } from "react";
import { useDb } from "../store/db";
import {
  Badge,
  Button,
  Callout,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  SectionHeading,
  Select,
  TabGroup,
  tipoMovimentoTone,
} from "../components/ui";
import { formatDate, hojeISO } from "../lib/format";
import { api } from "../services/api";
import { UNIDADES } from "../lib/unidades";
import type { Turno } from "../types";

type Tab = "contagem" | "presencas" | "entradas";

export function CasaCaridade() {
  const { db, currentUser, hasPerfil, executar } = useDb();
  const [tab, setTab] = useState<Tab>("contagem");
  const podeRegistar = hasPerfil("Direção", "Técnico de ação social", "Cozinha");
  const armazem = db.armazens.find((a) => a.codigo === "CDC")!;
  const artigos = db.artigos.filter((a) => a.armazemId === armazem.id);

  return (
    <div>
      <SectionHeading title="Casa da Caridade" />

      <TabGroup
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "contagem", label: "Contagem de refeições" },
          { value: "presencas", label: "Presenças nominais" },
          { value: "entradas", label: "Entradas e consumíveis" },
        ]}
      />

      {tab === "contagem" && (
        <Contagem podeRegistar={podeRegistar} onAdicionar={(c) => executar(() => api.post("/refeicoes/contagens", c))} />
      )}
      {tab === "presencas" && (
        <Presencas
          podeRegistar={podeRegistar}
          registadoPor={currentUser.nome}
          onMarcar={(p) => executar(() => api.post("/refeicoes/presencas", p))}
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
  onAdicionar: (c: { turno: Turno; numPessoas: number; sopas: number; pratos: number; sobremesas: number; pao: number; aguas: number }) => Promise<unknown>;
}) {
  const { db } = useDb();
  const [aberto, setAberto] = useState(false);
  const [turno, setTurno] = useState<Turno>("Almoço");
  const [campos, setCampos] = useState({
    numPessoas: 0,
    sopas: 0,
    pratos: 0,
    sobremesas: 0,
    pao: 0,
    aguas: 0,
  });

  const contagens = [...db.refeicoesContagem].sort((a, b) => b.data.localeCompare(a.data));

  const hoje = hojeISO();
  // Uma contagem é por dia + turno — registar duas vezes o mesmo turno no
  // mesmo dia duplicava os números em vez de os corrigir (para corrigir um
  // valor já registado, isso faz-se editando, não acrescentando outra linha).
  const jaRegistadoHoje = contagens.some((c) => c.data === hoje && c.turno === turno);

  async function submeter() {
    if (jaRegistadoHoje) return;
    const ok = await onAdicionar({ turno, ...campos });
    if (!ok) return;
    setAberto(false);
    setCampos({
      numPessoas: 0,
      sopas: 0,
      pratos: 0,
      sobremesas: 0,
      pao: 0,
      aguas: 0,
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
        dense
        rowKey={(c) => c.id}
        rows={contagens}
        columns={[
          { header: "Data", cell: (c) => formatDate(c.data) },
          { header: "Turno", cell: (c) => c.turno },
          { header: "Pessoas", cell: (c) => c.numPessoas, align: "right" },
          { header: "Sopas", cell: (c) => c.sopas, align: "right" },
          { header: "Pratos", cell: (c) => c.pratos, align: "right" },
          { header: "Sobremesas", cell: (c) => c.sobremesas, align: "right" },
          { header: "Pão", cell: (c) => c.pao, align: "right" },
          { header: "Águas", cell: (c) => c.aguas, align: "right" },
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
                ["sobremesas", "Sobremesas"],
                ["pao", "Pão"],
                ["aguas", "Águas"],
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
          {jaRegistadoHoje && (
            <Callout tone="brick" title="Contagem já registada">
              Já existe uma contagem para o {turno.toLowerCase()} de hoje — não é possível registar o
              mesmo turno duas vezes no mesmo dia.
            </Callout>
          )}
          <Button variant="primary" onClick={submeter} disabled={jaRegistadoHoje}>
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
  onMarcar: (p: { data: string; turno: Turno; processoId: string; modalidade: "Presencial" | "Take-away" }) => Promise<unknown>;
}) {
  const { db } = useDb();
  const hoje = hojeISO();
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
                      onMarcar({ data, turno, processoId: p.id, modalidade: "Presencial" })
                    }
                  >
                    Presencial
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onMarcar({ data, turno, processoId: p.id, modalidade: "Take-away" })
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
  const { db, hasPerfil, executar } = useDb();
  const podeRegistar = hasPerfil("Direção", "Armazém", "Cozinha");
  const [aberto, setAberto] = useState(false);
  const [artigoId, setArtigoId] = useState(artigos[0]?.id ?? NOVO_ARTIGO);
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
          <Button
            variant="primary"
            disabled={ehNovoArtigo && !novoNome.trim()}
            onClick={async () => {
              if (ehNovoArtigo && !novoNome.trim()) return;
              // Um nome já existente neste armazém reutiliza o artigo (o servidor garante-o); não duplica.
              const resultado = await executar(() =>
                api.post<{ artigo: { id: string } }>("/existencias/entradas", {
                  armazemId,
                  ...(ehNovoArtigo
                    ? { novoArtigo: { nome: novoNome.trim(), categoria: novaCategoria, unidade: novaUnidade, stockMinimo: novoStockMinimo } }
                    : { artigoId }),
                  quantidade,
                }),
              );
              if (!resultado) return;
              setAberto(false);
              setArtigoId(resultado.artigo.id);
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
