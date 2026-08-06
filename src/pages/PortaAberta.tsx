import { useMemo, useState } from "react";
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
  SuggestInput,
  Textarea,
  estadoTone,
} from "../components/ui";
import { formatDate, idade } from "../lib/format";
import { newId } from "../lib/id";
import type {
  Agregado,
  Atendimento,
  Contacto,
  EstadoCivil,
  EstadoProcesso,
  Parentesco,
  Periodicidade,
  Pessoa,
  Processo,
  SituacaoHabitacional,
  TipoContacto,
} from "../types";

type Tab = "agregados" | "processos";

const FREGUESIAS = [
  "Santa Maria Maior",
  "Misericórdia",
  "São Vicente",
  "Arroios",
  "Penha de França",
  "Santo António",
  "Estrela",
];

const SITUACOES_HABITACIONAIS: SituacaoHabitacional[] = [
  "Arrendada",
  "Própria",
  "Cedida",
  "Ocupação",
  "Sem-abrigo",
  "Outra",
];

const ESTADOS_CIVIS: EstadoCivil[] = [
  "Solteiro(a)",
  "Casado(a)",
  "União de facto",
  "Divorciado(a)",
  "Viúvo(a)",
];

const PARENTESCOS: Parentesco[] = ["Titular", "Cônjuge", "Filho(a)", "Neto(a)", "Pai/Mãe", "Outro"];

function proximoCodigoAgregado(db: ReturnType<typeof useDb>["db"]): string {
  const nums = db.agregados
    .map((a) => parseInt(a.codigo.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const proximo = (nums.length ? Math.max(...nums) : 0) + 1;
  return `AG-${String(proximo).padStart(3, "0")}`;
}

function proximoNumeroProcesso(db: ReturnType<typeof useDb>["db"]): number {
  return db.processos.reduce((max, p) => Math.max(max, p.numero), 0) + 1;
}

function calcularProximaAvaliacao(periodicidade: Periodicidade): string {
  const meses = periodicidade === "Mensal" ? 1 : periodicidade === "Trimestral" ? 3 : 6;
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

/**
 * Remove um processo e o que só a ele pertence (atendimentos, documentos,
 * inscrições). Cabazes, cartões, refeições e mensagens já entregues ficam —
 * são registo histórico/financeiro, não desaparecem só porque o processo fechou.
 */
function eliminarProcessoComCascata(
  db: ReturnType<typeof useDb>["db"],
  processo: Processo,
  removeRecord: ReturnType<typeof useDb>["removeRecord"],
  updateRecord: ReturnType<typeof useDb>["updateRecord"]
) {
  db.atendimentos.filter((a) => a.processoId === processo.id).forEach((a) => removeRecord("atendimentos", a.id));
  db.documentos.filter((d) => d.processoId === processo.id).forEach((d) => removeRecord("documentos", d.id));
  db.inscricoes.filter((i) => i.processoId === processo.id).forEach((i) => removeRecord("inscricoes", i.id));
  updateRecord("pessoas", processo.pessoaId, { temProcessoProprio: false });
  removeRecord("processos", processo.id);
}

/**
 * Remove uma pessoa isolada do agregado (ex.: saiu de casa, faleceu).
 * Cascata igual à do processo — cabazes, cartões e refeições já registados
 * mantêm-se como histórico, ligados a um processoId agora órfão.
 */
function eliminarPessoaComCascata(
  db: ReturnType<typeof useDb>["db"],
  pessoa: Pessoa,
  removeRecord: ReturnType<typeof useDb>["removeRecord"],
  updateRecord: ReturnType<typeof useDb>["updateRecord"]
) {
  const processoDaPessoa = db.processos.find((p) => p.pessoaId === pessoa.id);
  if (processoDaPessoa) eliminarProcessoComCascata(db, processoDaPessoa, removeRecord, updateRecord);
  db.contactos.filter((c) => c.pessoaId === pessoa.id).forEach((c) => removeRecord("contactos", c.id));
  removeRecord("pessoas", pessoa.id);
  const agregado = db.agregados.find((a) => a.id === pessoa.agregadoId);
  if (agregado) {
    updateRecord("agregados", agregado.id, {
      numPessoas: Math.max(0, agregado.numPessoas - 1),
      numMenores: Math.max(0, agregado.numMenores - (idade(pessoa.dataNascimento) < 18 ? 1 : 0)),
    });
  }
}

/** Remove um agregado e todas as pessoas e processos que só a ele pertencem. */
function eliminarAgregadoComCascata(
  db: ReturnType<typeof useDb>["db"],
  agregadoId: string,
  removeRecord: ReturnType<typeof useDb>["removeRecord"],
  updateRecord: ReturnType<typeof useDb>["updateRecord"]
) {
  const pessoasDoAgregado = db.pessoas.filter((p) => p.agregadoId === agregadoId);
  for (const pessoa of pessoasDoAgregado) {
    const processosDaPessoa = db.processos.filter((p) => p.pessoaId === pessoa.id);
    for (const processo of processosDaPessoa) {
      eliminarProcessoComCascata(db, processo, removeRecord, updateRecord);
    }
    db.contactos.filter((c) => c.pessoaId === pessoa.id).forEach((c) => removeRecord("contactos", c.id));
    removeRecord("pessoas", pessoa.id);
  }
  removeRecord("agregados", agregadoId);
}

export function PortaAberta() {
  const { db, currentUser, hasPerfil, addRecord, updateRecord, removeRecord } = useDb();
  const [tab, setTab] = useState<Tab>("agregados");
  const [agregadoAbertoId, setAgregadoAbertoId] = useState<string | null>(null);
  const [processoAbertoId, setProcessoAbertoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [novoAgregadoAberto, setNovoAgregadoAberto] = useState(false);
  const [adicionarPessoaAberto, setAdicionarPessoaAberto] = useState(false);
  const [editarAgregadoAberto, setEditarAgregadoAberto] = useState(false);
  const [eliminarAgregadoConfirmar, setEliminarAgregadoConfirmar] = useState(false);
  const [pessoaAbertaId, setPessoaAbertaId] = useState<string | null>(null);

  const vozLimitada = hasPerfil("Voluntário — distribuição");
  const podeEditar = hasPerfil("Direção", "Técnico de ação social");
  // Voluntariado de distribuição só vê nomes e composição do agregado — nunca
  // o processo de acompanhamento (NIF, contactos, atendimentos são dados de
  // ação social, fora do que este perfil pode consultar).
  const tabEfetivo: Tab = vozLimitada ? "agregados" : tab;

  const tecnicosDisponiveis = useMemo(
    () => db.utilizadores.filter((u) => u.perfil === "Técnico de ação social" && u.ativo),
    [db.utilizadores]
  );

  const agregados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return db.agregados
      .filter((a) => !termo || a.codigo.toLowerCase().includes(termo) || a.morada.toLowerCase().includes(termo))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [db.agregados, busca]);

  const processos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return db.processos
      .map((p) => ({ processo: p, pessoa: db.pessoas.find((pe) => pe.id === p.pessoaId)! }))
      .filter(
        ({ pessoa }) => !termo || pessoa.nome.toLowerCase().includes(termo)
      )
      .sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome, "pt-PT"));
  }, [db.processos, db.pessoas, busca]);

  const agregadoAberto = db.agregados.find((a) => a.id === agregadoAbertoId) ?? null;
  const processoAberto = db.processos.find((p) => p.id === processoAbertoId) ?? null;
  const pessoaAberta = db.pessoas.find((p) => p.id === pessoaAbertaId) ?? null;

  return (
    <div>
      <SectionHeading title="Porta Aberta" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-pine-900/15 bg-paper-raised p-1">
          {(vozLimitada ? (["agregados"] as Tab[]) : (["agregados", "processos"] as Tab[])).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                tabEfetivo === t ? "bg-pine-800 text-pine-50" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t === "agregados" ? "Agregados" : "Processos"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder={tabEfetivo === "agregados" ? "Procurar por código ou morada…" : "Procurar por nome…"}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-xs"
          />
          {tabEfetivo === "agregados" && podeEditar && (
            <Button variant="primary" onClick={() => setNovoAgregadoAberto(true)}>
              + Novo agregado
            </Button>
          )}
        </div>
      </div>

      {tabEfetivo === "agregados" ? (
        <Card padded={false}>
          <div className="p-5">
            <DataTable
              rowKey={(a) => a.id}
              rows={agregados}
              columns={[
                { header: "Código", cell: (a) => <span className="font-mono text-xs">{a.codigo}</span> },
                ...(vozLimitada
                  ? []
                  : [
                      { header: "Morada", cell: (a: (typeof agregados)[number]) => a.morada },
                      { header: "Freguesia", cell: (a: (typeof agregados)[number]) => a.freguesia },
                    ]),
                { header: "Pessoas", cell: (a) => a.numPessoas, align: "center" as const },
                { header: "Menores", cell: (a) => a.numMenores, align: "center" as const },
                ...(vozLimitada
                  ? []
                  : [
                      {
                        header: "Situação habitacional",
                        cell: (a: (typeof agregados)[number]) => <Badge>{a.situacaoHabitacional}</Badge>,
                      },
                    ]),
                {
                  header: "",
                  cell: (a) => (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setAgregadoAbertoId(a.id);
                        setAdicionarPessoaAberto(false);
                        setEditarAgregadoAberto(false);
                        setEliminarAgregadoConfirmar(false);
                      }}
                    >
                      Ver →
                    </Button>
                  ),
                  align: "right" as const,
                },
              ]}
            />
          </div>
        </Card>
      ) : (
        <Card padded={false}>
          <div className="p-5">
            <DataTable
              rowKey={({ processo }) => processo.id}
              rows={processos}
              columns={[
                { header: "Nº", cell: (_row, index) => <span className="font-mono text-xs">{index + 1}</span> },
                { header: "Nome", cell: ({ pessoa }) => pessoa.nome },
                ...(vozLimitada
                  ? []
                  : [{ header: "Técnica de referência", cell: ({ processo }: (typeof processos)[number]) => processo.tecnicaReferencia }]),
                { header: "Estado", cell: ({ processo }) => <Badge tone={estadoTone(processo.estado)}>{processo.estado}</Badge> },
                {
                  header: "Próxima avaliação",
                  cell: ({ processo }) => {
                    const vencida = new Date(processo.proximaAvaliacao) < new Date(new Date().toDateString());
                    return (
                      <span className={vencida ? "font-medium text-brick-600" : ""}>
                        {formatDate(processo.proximaAvaliacao)}
                      </span>
                    );
                  },
                },
                {
                  header: "",
                  cell: ({ processo }) => (
                    <Button variant="ghost" onClick={() => setProcessoAbertoId(processo.id)}>
                      Ver →
                    </Button>
                  ),
                  align: "right" as const,
                },
              ]}
            />
          </div>
        </Card>
      )}

      {agregadoAberto && (
        <Modal
          open
          onClose={() => setAgregadoAbertoId(null)}
          title={`Agregado ${agregadoAberto.codigo}`}
          width="max-w-2xl"
        >
          {podeEditar && (
            <div className="mb-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setEditarAgregadoAberto((v) => !v);
                  setEliminarAgregadoConfirmar(false);
                }}
              >
                {editarAgregadoAberto ? "Cancelar edição" : "Editar agregado"}
              </Button>
              <Button variant="danger" onClick={() => setEliminarAgregadoConfirmar(true)}>
                Eliminar agregado
              </Button>
            </div>
          )}

          {editarAgregadoAberto ? (
            <EditarAgregadoForm
              agregado={agregadoAberto}
              onGuardar={(patch) => {
                updateRecord("agregados", agregadoAberto.id, patch);
                setEditarAgregadoAberto(false);
              }}
            />
          ) : (
            !vozLimitada && (
              <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-ink-soft">Morada</dt>
                  <dd>{agregadoAberto.morada}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Freguesia</dt>
                  <dd>{agregadoAberto.freguesia}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Situação habitacional</dt>
                  <dd>{agregadoAberto.situacaoHabitacional}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Rendimento total</dt>
                  <dd>{agregadoAberto.rendimentoTotal} € / mês</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Data de abertura</dt>
                  <dd>{formatDate(agregadoAberto.dataAbertura)}</dd>
                </div>
              </dl>
            )
          )}
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-display text-base font-medium">Pessoas do agregado</h4>
            {podeEditar && (
              <Button variant="secondary" onClick={() => setAdicionarPessoaAberto((v) => !v)}>
                {adicionarPessoaAberto ? "Cancelar" : "+ Adicionar pessoa"}
              </Button>
            )}
          </div>

          {adicionarPessoaAberto && (
            <AdicionarPessoaForm
              agregado={agregadoAberto}
              tecnicos={tecnicosDisponiveis}
              tecnicoAtual={currentUser.nome}
              onAdicionar={({ pessoa, contacto, processo }) => {
                addRecord("pessoas", pessoa);
                updateRecord("agregados", agregadoAberto.id, {
                  numPessoas: agregadoAberto.numPessoas + 1,
                  numMenores: agregadoAberto.numMenores + (idade(pessoa.dataNascimento) < 18 ? 1 : 0),
                });
                if (contacto) addRecord("contactos", contacto);
                if (processo) addRecord("processos", processo);
                setAdicionarPessoaAberto(false);
              }}
            />
          )}

          <DataTable
            rowKey={(p) => p.id}
            rows={db.pessoas.filter((p) => p.agregadoId === agregadoAberto.id)}
            columns={[
              { header: "Nome", cell: (p) => p.nome },
              { header: "Idade", cell: (p) => idade(p.dataNascimento), align: "center" },
              { header: "Parentesco", cell: (p) => p.parentesco },
              ...(vozLimitada
                ? []
                : [
                    {
                      header: "Restrições",
                      cell: (p: (typeof db.pessoas)[number]) =>
                        p.restricoesAlimentares.length ? (
                          <div className="flex flex-wrap gap-1">
                            {p.restricoesAlimentares.map((r) => (
                              <Badge key={r} tone="gold">
                                {r}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          "—"
                        ),
                    },
                    {
                      header: "Processo próprio",
                      cell: (p: (typeof db.pessoas)[number]) =>
                        p.temProcessoProprio ? <Badge tone="pine">Sim</Badge> : <Badge>Não</Badge>,
                    },
                    {
                      header: "",
                      align: "right" as const,
                      cell: (p: (typeof db.pessoas)[number]) => (
                        <Button variant="ghost" onClick={() => setPessoaAbertaId(p.id)}>
                          Ver →
                        </Button>
                      ),
                    },
                  ]),
            ]}
          />
        </Modal>
      )}

      {pessoaAberta && (
        <PessoaModal
          pessoa={pessoaAberta}
          podeEditar={podeEditar}
          tecnicos={tecnicosDisponiveis}
          tecnicoAtual={currentUser.nome}
          processoDaPessoa={db.processos.find((p) => p.pessoaId === pessoaAberta.id) ?? null}
          numPessoasNoAgregado={db.pessoas.filter((p) => p.agregadoId === pessoaAberta.agregadoId).length}
          onClose={() => setPessoaAbertaId(null)}
          onRemover={() => {
            eliminarPessoaComCascata(db, pessoaAberta, removeRecord, updateRecord);
            setPessoaAbertaId(null);
          }}
          onAtualizar={(patch) => {
            const antesMenor = idade(pessoaAberta.dataNascimento) < 18;
            updateRecord("pessoas", pessoaAberta.id, patch);
            if (patch.dataNascimento) {
              const depoisMenor = idade(patch.dataNascimento) < 18;
              if (antesMenor !== depoisMenor) {
                updateRecord("agregados", pessoaAberta.agregadoId, {
                  numMenores: db.agregados.find((a) => a.id === pessoaAberta.agregadoId)!.numMenores + (depoisMenor ? 1 : -1),
                });
              }
            }
          }}
          onAbrirProcesso={({ tecnicaReferencia, periodicidade }) => {
            const novoProcesso: Processo = {
              id: newId("prc"),
              numero: proximoNumeroProcesso(db),
              pessoaId: pessoaAberta.id,
              tecnicaReferencia,
              dataAbertura: new Date().toISOString().slice(0, 10),
              estado: "Ativo",
              periodicidadeReavaliacao: periodicidade,
              proximaAvaliacao: calcularProximaAvaliacao(periodicidade),
            };
            addRecord("processos", novoProcesso);
            updateRecord("pessoas", pessoaAberta.id, { temProcessoProprio: true });
          }}
          onVerProcesso={(processoId) => {
            setPessoaAbertaId(null);
            setProcessoAbertoId(processoId);
          }}
        />
      )}

      {agregadoAberto && eliminarAgregadoConfirmar && (
        <Modal open onClose={() => setEliminarAgregadoConfirmar(false)} title="Eliminar agregado">
          {(() => {
            const pessoasDoAgregado = db.pessoas.filter((p) => p.agregadoId === agregadoAberto.id);
            const numProcessos = pessoasDoAgregado.filter((p) => p.temProcessoProprio).length;
            return (
              <div className="space-y-4">
                <p className="text-sm text-ink-soft">
                  Tem a certeza de que quer eliminar o agregado{" "}
                  <strong className="text-ink">{agregadoAberto.codigo}</strong>? Isto remove também{" "}
                  <strong className="text-ink">
                    {pessoasDoAgregado.length} pessoa{pessoasDoAgregado.length === 1 ? "" : "s"}
                  </strong>{" "}
                  e{" "}
                  <strong className="text-ink">
                    {numProcessos} processo{numProcessos === 1 ? "" : "s"}
                  </strong>{" "}
                  associados (atendimentos, documentos e inscrições incluídos). Cabazes, cartões e
                  refeições já registados mantêm-se, como histórico. A ação não pode ser desfeita.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEliminarAgregadoConfirmar(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      eliminarAgregadoComCascata(db, agregadoAberto.id, removeRecord, updateRecord);
                      setEliminarAgregadoConfirmar(false);
                      setAgregadoAbertoId(null);
                    }}
                  >
                    Eliminar agregado
                  </Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {processoAberto && !vozLimitada && (
        <ProcessoModal
          processo={processoAberto}
          onClose={() => setProcessoAbertoId(null)}
          podeEditar={podeEditar}
          tecnicoAtual={currentUser.nome}
          tecnicos={tecnicosDisponiveis}
          onRegistarAtendimento={(dados) => {
            addRecord("atendimentos", {
              id: newId("ate"),
              processoId: processoAberto.id,
              ...dados,
            });
          }}
          onAtualizar={(patch) => updateRecord("processos", processoAberto.id, patch)}
          onEliminar={() => {
            eliminarProcessoComCascata(db, processoAberto, removeRecord, updateRecord);
            setProcessoAbertoId(null);
          }}
        />
      )}

      <Modal open={novoAgregadoAberto} onClose={() => setNovoAgregadoAberto(false)} title="Novo agregado" width="max-w-2xl">
        <NovoAgregadoForm
          codigoSugerido={proximoCodigoAgregado(db)}
          numeroProcessoSugerido={proximoNumeroProcesso(db)}
          tecnicos={tecnicosDisponiveis}
          tecnicoAtual={currentUser.nome}
          onCriar={({ agregado, pessoa, contacto, processo }) => {
            addRecord("agregados", agregado);
            addRecord("pessoas", pessoa);
            if (contacto) addRecord("contactos", contacto);
            if (processo) addRecord("processos", processo);
            setNovoAgregadoAberto(false);
            setAgregadoAbertoId(agregado.id);
          }}
        />
      </Modal>
    </div>
  );
}

// -------------------------------------------------------- Novo agregado

function NovoAgregadoForm({
  codigoSugerido,
  numeroProcessoSugerido,
  tecnicos,
  tecnicoAtual,
  onCriar,
}: {
  codigoSugerido: string;
  numeroProcessoSugerido: number;
  tecnicos: ReturnType<typeof useDb>["db"]["utilizadores"];
  tecnicoAtual: string;
  onCriar: (dados: {
    agregado: Agregado;
    pessoa: Pessoa;
    contacto: Contacto | null;
    processo: Processo | null;
  }) => void;
}) {
  const [morada, setMorada] = useState("");
  const [freguesia, setFreguesia] = useState(FREGUESIAS[0]);
  const [situacao, setSituacao] = useState<SituacaoHabitacional>("Arrendada");
  const [rendimento, setRendimento] = useState(0);

  const [nome, setNome] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [nacionalidade, setNacionalidade] = useState("Portuguesa");
  const [estadoCivil, setEstadoCivil] = useState<EstadoCivil>("Solteiro(a)");
  const [nif, setNif] = useState("");
  const [telefone, setTelefone] = useState("");

  const [abrirProcesso, setAbrirProcesso] = useState(true);
  const [tecnicaReferencia, setTecnicaReferencia] = useState(
    () => tecnicos.find((t) => t.nome === tecnicoAtual)?.nome ?? tecnicos[0]?.nome ?? tecnicoAtual
  );
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("Trimestral");

  const podeCriar = morada.trim() && nome.trim() && dataNascimento;

  function submeter() {
    if (!podeCriar) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const agregadoId = newId("agr");
    const pessoaId = newId("pes");

    const agregado: Agregado = {
      id: agregadoId,
      codigo: codigoSugerido,
      morada: morada.trim(),
      freguesia,
      situacaoHabitacional: situacao,
      rendimentoTotal: rendimento,
      numPessoas: 1,
      numMenores: idade(dataNascimento) < 18 ? 1 : 0,
      dataAbertura: hoje,
    };

    const pessoa: Pessoa = {
      id: pessoaId,
      agregadoId,
      nome: nome.trim(),
      dataNascimento,
      nacionalidade,
      estadoCivil,
      nif,
      documentoTipo: "Cartão de Cidadão",
      documentoNumero: "",
      documentoValidade: null,
      parentesco: "Titular",
      restricoesAlimentares: [],
      incapacidade: false,
      temProcessoProprio: abrirProcesso,
    };

    const contacto: Contacto | null = telefone.trim()
      ? {
          id: newId("con"),
          pessoaId,
          tipo: "Telemóvel",
          valor: telefone.trim(),
          consentimento: true,
          dataConsentimento: hoje,
          preferencial: true,
        }
      : null;

    const processo: Processo | null = abrirProcesso
      ? {
          id: newId("prc"),
          numero: numeroProcessoSugerido,
          pessoaId,
          tecnicaReferencia,
          dataAbertura: hoje,
          estado: "Ativo",
          periodicidadeReavaliacao: periodicidade,
          proximaAvaliacao: calcularProximaAvaliacao(periodicidade),
        }
      : null;

    onCriar({ agregado, pessoa, contacto, processo });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
          Agregado {codigoSugerido}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Morada">
              <Input value={morada} onChange={(e) => setMorada(e.target.value)} required />
            </Field>
          </div>
          <Field label="Freguesia">
            <SuggestInput value={freguesia} onChange={setFreguesia} suggestions={FREGUESIAS} />
          </Field>
          <Field label="Situação habitacional">
            <Select value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoHabitacional)}>
              {SITUACOES_HABITACIONAIS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <div className="col-span-2">
            <Field label="Rendimento total (€/mês)">
              <Input type="number" min={0} value={rendimento} onChange={(e) => setRendimento(Number(e.target.value))} />
            </Field>
          </div>
        </div>
      </div>

      <div className="border-t border-pine-900/10 pt-4">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
          Titular (primeira pessoa do agregado)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nome completo">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
            </Field>
          </div>
          <Field label="Data de nascimento">
            <Input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} required />
          </Field>
          <Field label="Nacionalidade">
            <Input value={nacionalidade} onChange={(e) => setNacionalidade(e.target.value)} />
          </Field>
          <Field label="Estado civil">
            <Select value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value as EstadoCivil)}>
              {ESTADOS_CIVIS.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </Select>
          </Field>
          <Field label="NIF">
            <Input value={nif} onChange={(e) => setNif(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field label="Telemóvel (opcional)">
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="9XXXXXXXX" />
            </Field>
          </div>
        </div>
      </div>

      <div className="border-t border-pine-900/10 pt-4">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={abrirProcesso} onChange={(e) => setAbrirProcesso(e.target.checked)} />
          Abrir processo de acompanhamento para o titular
        </label>
        {abrirProcesso && (
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-pine-900/10 bg-pine-50/60 p-3">
            <Field label="Técnica de referência">
              <Select value={tecnicaReferencia} onChange={(e) => setTecnicaReferencia(e.target.value)}>
                {tecnicos.length === 0 && <option value={tecnicoAtual}>{tecnicoAtual}</option>}
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.nome}>
                    {t.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Periodicidade de reavaliação">
              <Select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)}>
                <option>Mensal</option>
                <option>Trimestral</option>
                <option>Semestral</option>
              </Select>
            </Field>
          </div>
        )}
      </div>

      <Button variant="primary" disabled={!podeCriar} onClick={submeter}>
        Criar agregado
      </Button>
    </div>
  );
}

// -------------------------------------------------------------- Editar agregado

function EditarAgregadoForm({
  agregado,
  onGuardar,
}: {
  agregado: Agregado;
  onGuardar: (patch: Partial<Agregado>) => void;
}) {
  const [morada, setMorada] = useState(agregado.morada);
  const [freguesia, setFreguesia] = useState(agregado.freguesia);
  const [situacao, setSituacao] = useState<SituacaoHabitacional>(agregado.situacaoHabitacional);
  const [rendimento, setRendimento] = useState(agregado.rendimentoTotal);

  const podeGuardar = morada.trim();

  return (
    <div className="mb-5 space-y-3 rounded-xl border border-pine-900/10 bg-pine-50/60 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Morada">
            <Input value={morada} onChange={(e) => setMorada(e.target.value)} autoFocus />
          </Field>
        </div>
        <Field label="Freguesia">
          <SuggestInput value={freguesia} onChange={setFreguesia} suggestions={FREGUESIAS} />
        </Field>
        <Field label="Situação habitacional">
          <Select value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoHabitacional)}>
            {SITUACOES_HABITACIONAIS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2">
          <Field label="Rendimento total (€/mês)">
            <Input type="number" min={0} value={rendimento} onChange={(e) => setRendimento(Number(e.target.value))} />
          </Field>
        </div>
      </div>
      <Button
        variant="primary"
        disabled={!podeGuardar}
        onClick={() =>
          onGuardar({
            morada: morada.trim(),
            freguesia,
            situacaoHabitacional: situacao,
            rendimentoTotal: rendimento,
          })
        }
      >
        Guardar alterações
      </Button>
    </div>
  );
}

// -------------------------------------------------------- Adicionar pessoa

function AdicionarPessoaForm({
  agregado,
  tecnicos,
  tecnicoAtual,
  onAdicionar,
}: {
  agregado: Agregado;
  tecnicos: ReturnType<typeof useDb>["db"]["utilizadores"];
  tecnicoAtual: string;
  onAdicionar: (dados: { pessoa: Pessoa; contacto: Contacto | null; processo: Processo | null }) => void;
}) {
  const { db } = useDb();
  const [nome, setNome] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [nacionalidade, setNacionalidade] = useState("Portuguesa");
  const [parentesco, setParentesco] = useState<Parentesco>("Filho(a)");
  const [abrirProcesso, setAbrirProcesso] = useState(false);
  const [tecnicaReferencia, setTecnicaReferencia] = useState(
    () => tecnicos.find((t) => t.nome === tecnicoAtual)?.nome ?? tecnicos[0]?.nome ?? tecnicoAtual
  );
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("Trimestral");

  const podeAdicionar = nome.trim() && dataNascimento;

  function submeter() {
    if (!podeAdicionar) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const pessoaId = newId("pes");

    const pessoa: Pessoa = {
      id: pessoaId,
      agregadoId: agregado.id,
      nome: nome.trim(),
      dataNascimento,
      nacionalidade,
      estadoCivil: "Solteiro(a)",
      nif: "",
      documentoTipo: "Cartão de Cidadão",
      documentoNumero: "",
      documentoValidade: null,
      parentesco,
      restricoesAlimentares: [],
      incapacidade: false,
      temProcessoProprio: abrirProcesso,
    };

    const processo: Processo | null = abrirProcesso
      ? {
          id: newId("prc"),
          numero: proximoNumeroProcesso(db),
          pessoaId,
          tecnicaReferencia,
          dataAbertura: hoje,
          estado: "Ativo",
          periodicidadeReavaliacao: periodicidade,
          proximaAvaliacao: calcularProximaAvaliacao(periodicidade),
        }
      : null;

    onAdicionar({ pessoa, contacto: null, processo });
  }

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-pine-900/10 bg-pine-50/60 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Nome completo">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </Field>
        </div>
        <Field label="Data de nascimento">
          <Input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} />
        </Field>
        <Field label="Parentesco">
          <Select value={parentesco} onChange={(e) => setParentesco(e.target.value as Parentesco)}>
            {PARENTESCOS.filter((p) => p !== "Titular").map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nacionalidade">
          <Input value={nacionalidade} onChange={(e) => setNacionalidade(e.target.value)} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" checked={abrirProcesso} onChange={(e) => setAbrirProcesso(e.target.checked)} />
        Esta pessoa também precisa de processo próprio
      </label>

      {abrirProcesso && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Técnica de referência">
            <Select value={tecnicaReferencia} onChange={(e) => setTecnicaReferencia(e.target.value)}>
              {tecnicos.length === 0 && <option value={tecnicoAtual}>{tecnicoAtual}</option>}
              {tecnicos.map((t) => (
                <option key={t.id} value={t.nome}>
                  {t.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Periodicidade">
            <Select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)}>
              <option>Mensal</option>
              <option>Trimestral</option>
              <option>Semestral</option>
            </Select>
          </Field>
        </div>
      )}

      <Button variant="primary" disabled={!podeAdicionar} onClick={submeter}>
        Adicionar pessoa
      </Button>
    </div>
  );
}

function ProcessoModal({
  processo,
  onClose,
  podeEditar,
  tecnicoAtual,
  tecnicos,
  onRegistarAtendimento,
  onAtualizar,
  onEliminar,
}: {
  processo: Processo;
  onClose: () => void;
  podeEditar: boolean;
  tecnicoAtual: string;
  tecnicos: ReturnType<typeof useDb>["db"]["utilizadores"];
  onRegistarAtendimento: (dados: Omit<Atendimento, "id" | "processoId">) => void;
  onAtualizar: (patch: Partial<Processo>) => void;
  onEliminar: () => void;
}) {
  const { db } = useDb();
  const pessoa = db.pessoas.find((p) => p.id === processo.pessoaId)!;
  const agregado = db.agregados.find((a) => a.id === pessoa.agregadoId);
  const contactos = db.contactos.filter((c) => c.pessoaId === pessoa.id);
  const inscricoes = db.inscricoes.filter((i) => i.processoId === processo.id);
  const atendimentos = db.atendimentos
    .filter((a) => a.processoId === processo.id)
    .sort((a, b) => b.data.localeCompare(a.data));
  const documentos = db.documentos.filter((d) => d.processoId === processo.id);

  const [novoAberto, setNovoAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [tipo, setTipo] = useState<Atendimento["tipo"]>("Acompanhamento");
  const [editarAberto, setEditarAberto] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  if (confirmarEliminar) {
    return (
      <Modal open onClose={() => setConfirmarEliminar(false)} title="Eliminar processo">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Tem a certeza de que quer eliminar o processo nº {processo.numero} de{" "}
            <strong className="text-ink">{pessoa.nome}</strong>? Os atendimentos, documentos e
            inscrições deste processo são removidos. Cabazes, cartões e refeições já registados
            mantêm-se, como histórico. A ação não pode ser desfeita.
          </p>
          <p className="text-sm text-ink-soft">
            Se o objetivo é apenas terminar o acompanhamento, considere antes editar o processo e
            mudar o estado para "Encerrado".
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmarEliminar(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={onEliminar}>
              Eliminar processo
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Processo nº ${processo.numero} — ${pessoa.nome}`} width="max-w-3xl">
      {podeEditar && (
        <div className="mb-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditarAberto((v) => !v)}>
            {editarAberto ? "Cancelar edição" : "Editar processo"}
          </Button>
          <Button variant="danger" onClick={() => setConfirmarEliminar(true)}>
            Eliminar processo
          </Button>
        </div>
      )}

      {editarAberto ? (
        <EditarProcessoForm
          processo={processo}
          tecnicos={tecnicos}
          tecnicoAtual={tecnicoAtual}
          onGuardar={(patch) => {
            onAtualizar(patch);
            setEditarAberto(false);
          }}
        />
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-soft">Agregado</dt>
            <dd>{agregado?.codigo ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Técnica de referência</dt>
            <dd>{processo.tecnicaReferencia}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Estado</dt>
            <dd>
              <Badge tone={estadoTone(processo.estado)}>{processo.estado}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">Periodicidade</dt>
            <dd>{processo.periodicidadeReavaliacao}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Próxima avaliação</dt>
            <dd>{formatDate(processo.proximaAvaliacao)}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">NIF</dt>
            <dd>{pessoa.nif}</dd>
          </div>
        </div>
      )}

      <h4 className="mb-2 font-display text-base font-medium">Contactos</h4>
      <ul className="mb-5 space-y-1 text-sm">
        {contactos.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="text-ink-soft">{c.tipo}:</span> {c.valor}
            {c.preferencial && <Badge tone="pine">Preferencial</Badge>}
            {!c.consentimento && <Badge tone="brick">Sem consentimento</Badge>}
          </li>
        ))}
      </ul>

      <h4 className="mb-2 font-display text-base font-medium">Inscrições em programas</h4>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {inscricoes.length === 0 && <span className="text-sm text-ink-soft">Sem inscrições.</span>}
        {inscricoes.map((i) => (
          <Badge key={i.id} tone={i.estado === "Ativa" ? "pine" : "neutral"}>
            {i.programa}
          </Badge>
        ))}
      </div>

      <h4 className="mb-2 font-display text-base font-medium">Documentos</h4>
      <ul className="mb-5 space-y-1 text-sm text-ink-soft">
        {documentos.map((d) => (
          <li key={d.id}>
            {d.tipo} — {d.ficheiro} {d.validade && `· válido até ${formatDate(d.validade)}`}
          </li>
        ))}
      </ul>

      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display text-base font-medium">Histórico de atendimentos</h4>
        {podeEditar && (
          <Button variant="secondary" onClick={() => setNovoAberto((v) => !v)}>
            {novoAberto ? "Cancelar" : "+ Registar atendimento"}
          </Button>
        )}
      </div>

      {novoAberto && (
        <form
          className="mb-4 space-y-3 rounded-xl border border-pine-900/10 bg-pine-50/60 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onRegistarAtendimento({
              data: new Date().toISOString().slice(0, 10),
              tipo,
              motivo,
              observacoes,
              necessidadesDetetadas: [],
              encaminhamento: "",
              proximaAvaliacao: processo.proximaAvaliacao,
              tecnico: tecnicoAtual,
            });
            setMotivo("");
            setObservacoes("");
            setNovoAberto(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as Atendimento["tipo"])}>
                <option>Primeira consulta</option>
                <option>Acompanhamento</option>
                <option>Reavaliação</option>
                <option>Emergência</option>
              </Select>
            </Field>
            <Field label="Técnico">
              <Input value={tecnicoAtual} disabled />
            </Field>
          </div>
          <Field label="Motivo">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
          </Field>
          <Field label="Observações">
            <Textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary">
            Guardar atendimento
          </Button>
        </form>
      )}

      <DataTable
        rowKey={(a) => a.id}
        rows={atendimentos}
        emptyLabel="Sem atendimentos registados."
        columns={[
          { header: "Data", cell: (a) => formatDate(a.data) },
          { header: "Tipo", cell: (a) => a.tipo },
          { header: "Motivo", cell: (a) => <span className="text-ink-soft">{a.motivo}</span> },
          { header: "Técnico", cell: (a) => a.tecnico },
        ]}
      />
    </Modal>
  );
}

// -------------------------------------------------------------- Editar processo

function EditarProcessoForm({
  processo,
  tecnicos,
  tecnicoAtual,
  onGuardar,
}: {
  processo: Processo;
  tecnicos: ReturnType<typeof useDb>["db"]["utilizadores"];
  tecnicoAtual: string;
  onGuardar: (patch: Partial<Processo>) => void;
}) {
  const [tecnicaReferencia, setTecnicaReferencia] = useState(processo.tecnicaReferencia);
  const [estado, setEstado] = useState<EstadoProcesso>(processo.estado);
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>(processo.periodicidadeReavaliacao);
  const [proximaAvaliacao, setProximaAvaliacao] = useState(processo.proximaAvaliacao);

  return (
    <div className="mb-5 space-y-3 rounded-xl border border-pine-900/10 bg-pine-50/60 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Técnica de referência">
          <Select value={tecnicaReferencia} onChange={(e) => setTecnicaReferencia(e.target.value)}>
            {tecnicos.length === 0 && <option value={tecnicoAtual}>{tecnicoAtual}</option>}
            {tecnicos.map((t) => (
              <option key={t.id} value={t.nome}>
                {t.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoProcesso)}>
            <option>Ativo</option>
            <option>Suspenso</option>
            <option>Encerrado</option>
          </Select>
        </Field>
        <Field label="Periodicidade de reavaliação">
          <Select
            value={periodicidade}
            onChange={(e) => {
              const novaPeriodicidade = e.target.value as Periodicidade;
              setPeriodicidade(novaPeriodicidade);
              setProximaAvaliacao(calcularProximaAvaliacao(novaPeriodicidade));
            }}
          >
            <option>Mensal</option>
            <option>Trimestral</option>
            <option>Semestral</option>
          </Select>
        </Field>
        <Field label="Próxima avaliação">
          <Input type="date" value={proximaAvaliacao} onChange={(e) => setProximaAvaliacao(e.target.value)} />
        </Field>
      </div>
      <Button
        variant="primary"
        onClick={() => onGuardar({ tecnicaReferencia, estado, periodicidadeReavaliacao: periodicidade, proximaAvaliacao })}
      >
        Guardar alterações
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ Pessoa

function PessoaModal({
  pessoa,
  podeEditar,
  tecnicos,
  tecnicoAtual,
  processoDaPessoa,
  numPessoasNoAgregado,
  onClose,
  onAtualizar,
  onAbrirProcesso,
  onVerProcesso,
  onRemover,
}: {
  pessoa: Pessoa;
  podeEditar: boolean;
  tecnicos: ReturnType<typeof useDb>["db"]["utilizadores"];
  tecnicoAtual: string;
  processoDaPessoa: Processo | null;
  numPessoasNoAgregado: number;
  onClose: () => void;
  onAtualizar: (patch: Partial<Pessoa>) => void;
  onAbrirProcesso: (dados: { tecnicaReferencia: string; periodicidade: Periodicidade }) => void;
  onVerProcesso: (processoId: string) => void;
  onRemover: () => void;
}) {
  const { db, addRecord, removeRecord } = useDb();
  const contactos = db.contactos.filter((c) => c.pessoaId === pessoa.id);

  const [editarAberto, setEditarAberto] = useState(false);
  const [abrirProcessoAberto, setAbrirProcessoAberto] = useState(false);
  const [confirmarRemover, setConfirmarRemover] = useState(false);
  const [adicionarContactoAberto, setAdicionarContactoAberto] = useState(false);
  const [tecnicaReferencia, setTecnicaReferencia] = useState(
    () => tecnicos.find((t) => t.nome === tecnicoAtual)?.nome ?? tecnicos[0]?.nome ?? tecnicoAtual
  );
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("Trimestral");

  const podeRemover = numPessoasNoAgregado > 1;

  if (confirmarRemover) {
    return (
      <Modal open onClose={() => setConfirmarRemover(false)} title="Remover pessoa">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Tem a certeza de que quer remover <strong className="text-ink">{pessoa.nome}</strong> do
            agregado?
            {processoDaPessoa &&
              " O processo de acompanhamento próprio desta pessoa, com os respetivos atendimentos, documentos e inscrições, é removido."}{" "}
            Os contactos registados para esta pessoa também são removidos. Cabazes, cartões e refeições já
            registados mantêm-se, como histórico. A ação não pode ser desfeita.
          </p>
          {pessoa.parentesco === "Titular" && (
            <p className="text-sm font-medium text-brick-600">
              Esta é a pessoa titular do agregado. Depois de a remover, poderá editar outra pessoa do
              agregado para lhe atribuir o parentesco "Titular".
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmarRemover(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={onRemover}>
              Remover pessoa
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={pessoa.nome} width="max-w-xl">
      {podeEditar && (
        <div className="mb-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditarAberto((v) => !v)}>
            {editarAberto ? "Cancelar edição" : "Editar pessoa"}
          </Button>
          <Button
            variant="danger"
            disabled={!podeRemover}
            title={podeRemover ? undefined : "Para remover a última pessoa do agregado, elimine o agregado."}
            onClick={() => setConfirmarRemover(true)}
          >
            Remover pessoa
          </Button>
        </div>
      )}

      {editarAberto ? (
        <EditarPessoaForm
          pessoa={pessoa}
          onGuardar={(patch) => {
            onAtualizar(patch);
            setEditarAberto(false);
          }}
        />
      ) : (
        <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-ink-soft">Data de nascimento</dt>
            <dd>
              {formatDate(pessoa.dataNascimento)} ({idade(pessoa.dataNascimento)} anos)
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">Parentesco</dt>
            <dd>{pessoa.parentesco}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Nacionalidade</dt>
            <dd>{pessoa.nacionalidade}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Estado civil</dt>
            <dd>{pessoa.estadoCivil}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">NIF</dt>
            <dd>{pessoa.nif || "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Documento</dt>
            <dd>
              {pessoa.documentoTipo}
              {pessoa.documentoNumero && ` · ${pessoa.documentoNumero}`}
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">Restrições alimentares</dt>
            <dd>{pessoa.restricoesAlimentares.length ? pessoa.restricoesAlimentares.join(", ") : "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Incapacidade</dt>
            <dd>{pessoa.incapacidade ? "Sim" : "Não"}</dd>
          </div>
        </dl>
      )}

      <div className="mb-5 border-t border-pine-900/10 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-display text-base font-medium">Contactos</h4>
          {podeEditar && (
            <Button variant="secondary" onClick={() => setAdicionarContactoAberto((v) => !v)}>
              {adicionarContactoAberto ? "Cancelar" : "+ Adicionar contacto"}
            </Button>
          )}
        </div>

        {adicionarContactoAberto && (
          <AdicionarContactoForm
            onAdicionar={(dados) => {
              addRecord("contactos", { id: newId("con"), pessoaId: pessoa.id, ...dados });
              setAdicionarContactoAberto(false);
            }}
          />
        )}

        <ul className="space-y-1.5 text-sm">
          {contactos.length === 0 && <li className="text-ink-soft">Sem contactos registados.</li>}
          {contactos.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-ink-soft">{c.tipo}:</span> {c.valor}
                {c.preferencial && <Badge tone="pine">Preferencial</Badge>}
                {!c.consentimento && <Badge tone="brick">Sem consentimento</Badge>}
              </span>
              {podeEditar && (
                <Button variant="ghost" onClick={() => removeRecord("contactos", c.id)}>
                  Remover
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-pine-900/10 pt-4">
        <h4 className="mb-2 font-display text-base font-medium">Processo de acompanhamento</h4>
        {processoDaPessoa ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-soft">
              Processo nº {processoDaPessoa.numero} · <Badge tone={estadoTone(processoDaPessoa.estado)}>{processoDaPessoa.estado}</Badge>
            </p>
            <Button variant="secondary" onClick={() => onVerProcesso(processoDaPessoa.id)}>
              Ver processo →
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-soft">Esta pessoa não tem processo de acompanhamento.</p>
            {podeEditar &&
              (abrirProcessoAberto ? (
                <div className="space-y-3 rounded-xl border border-pine-900/10 bg-pine-50/60 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Técnica de referência">
                      <Select value={tecnicaReferencia} onChange={(e) => setTecnicaReferencia(e.target.value)}>
                        {tecnicos.length === 0 && <option value={tecnicoAtual}>{tecnicoAtual}</option>}
                        {tecnicos.map((t) => (
                          <option key={t.id} value={t.nome}>
                            {t.nome}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Periodicidade">
                      <Select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)}>
                        <option>Mensal</option>
                        <option>Trimestral</option>
                        <option>Semestral</option>
                      </Select>
                    </Field>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => {
                      onAbrirProcesso({ tecnicaReferencia, periodicidade });
                      setAbrirProcessoAberto(false);
                    }}
                  >
                    Confirmar abertura
                  </Button>
                </div>
              ) : (
                <Button variant="primary" onClick={() => setAbrirProcessoAberto(true)}>
                  + Abrir processo
                </Button>
              ))}
          </>
        )}
      </div>
    </Modal>
  );
}

function AdicionarContactoForm({
  onAdicionar,
}: {
  onAdicionar: (dados: Omit<Contacto, "id" | "pessoaId">) => void;
}) {
  const [tipo, setTipo] = useState<TipoContacto>("Telemóvel");
  const [valor, setValor] = useState("");
  const [preferencial, setPreferencial] = useState(false);
  const [consentimento, setConsentimento] = useState(true);

  const podeAdicionar = valor.trim();

  return (
    <div className="mb-3 space-y-3 rounded-xl border border-pine-900/10 bg-pine-50/60 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoContacto)}>
            <option>Telemóvel</option>
            <option>Telefone fixo</option>
            <option>Email</option>
          </Select>
        </Field>
        <Field label="Valor">
          <Input value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" checked={preferencial} onChange={(e) => setPreferencial(e.target.checked)} />
        Contacto preferencial
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} />
        Tem consentimento para ser contactado(a) por este meio
      </label>
      <Button
        variant="primary"
        disabled={!podeAdicionar}
        onClick={() =>
          onAdicionar({
            tipo,
            valor: valor.trim(),
            preferencial,
            consentimento,
            dataConsentimento: consentimento ? new Date().toISOString().slice(0, 10) : null,
          })
        }
      >
        Adicionar contacto
      </Button>
    </div>
  );
}

function EditarPessoaForm({
  pessoa,
  onGuardar,
}: {
  pessoa: Pessoa;
  onGuardar: (patch: Partial<Pessoa>) => void;
}) {
  const [nome, setNome] = useState(pessoa.nome);
  const [dataNascimento, setDataNascimento] = useState(pessoa.dataNascimento);
  const [nacionalidade, setNacionalidade] = useState(pessoa.nacionalidade);
  const [estadoCivil, setEstadoCivil] = useState<EstadoCivil>(pessoa.estadoCivil);
  const [parentesco, setParentesco] = useState<Parentesco>(pessoa.parentesco);
  const [nif, setNif] = useState(pessoa.nif);
  const [restricoes, setRestricoes] = useState(pessoa.restricoesAlimentares.join(", "));
  const [incapacidade, setIncapacidade] = useState(pessoa.incapacidade);

  const podeGuardar = nome.trim() && dataNascimento;

  return (
    <div className="mb-5 space-y-3 rounded-xl border border-pine-900/10 bg-pine-50/60 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Nome completo">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </Field>
        </div>
        <Field label="Data de nascimento">
          <Input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} />
        </Field>
        <Field label="Parentesco">
          <Select value={parentesco} onChange={(e) => setParentesco(e.target.value as Parentesco)}>
            {PARENTESCOS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nacionalidade">
          <Input value={nacionalidade} onChange={(e) => setNacionalidade(e.target.value)} />
        </Field>
        <Field label="Estado civil">
          <Select value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value as EstadoCivil)}>
            {ESTADOS_CIVIS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </Select>
        </Field>
        <Field label="NIF">
          <Input value={nif} onChange={(e) => setNif(e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Restrições alimentares" hint="Separadas por vírgula.">
            <Input value={restricoes} onChange={(e) => setRestricoes(e.target.value)} placeholder="ex.: Diabetes, Sem glúten" />
          </Field>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" checked={incapacidade} onChange={(e) => setIncapacidade(e.target.checked)} />
        Tem incapacidade
      </label>
      <Button
        variant="primary"
        disabled={!podeGuardar}
        onClick={() =>
          onGuardar({
            nome: nome.trim(),
            dataNascimento,
            nacionalidade,
            estadoCivil,
            parentesco,
            nif,
            restricoesAlimentares: restricoes
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean),
            incapacidade,
          })
        }
      >
        Guardar alterações
      </Button>
    </div>
  );
}
