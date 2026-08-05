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
  Textarea,
  estadoTone,
} from "../components/ui";
import { formatDate, idade } from "../lib/format";
import { newId } from "../lib/id";
import type { Atendimento, Processo } from "../types";

type Tab = "agregados" | "processos";

export function PortaAberta() {
  const { db, currentUser, hasPerfil, addRecord } = useDb();
  const [tab, setTab] = useState<Tab>("agregados");
  const [agregadoAbertoId, setAgregadoAbertoId] = useState<string | null>(null);
  const [processoAbertoId, setProcessoAbertoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const vozLimitada = hasPerfil("Voluntário — distribuição");
  const podeEditar = hasPerfil("Direção", "Técnico de ação social");

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
      .sort((a, b) => a.processo.numero - b.processo.numero);
  }, [db.processos, db.pessoas, busca]);

  const agregadoAberto = db.agregados.find((a) => a.id === agregadoAbertoId) ?? null;
  const processoAberto = db.processos.find((p) => p.id === processoAbertoId) ?? null;

  return (
    <div>
      <SectionHeading title="Porta Aberta" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-pine-900/15 bg-paper-raised p-1">
          {(["agregados", "processos"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                tab === t ? "bg-pine-800 text-pine-50" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t === "agregados" ? "Agregados" : "Processos"}
            </button>
          ))}
        </div>
        <Input
          placeholder={tab === "agregados" ? "Procurar por código ou morada…" : "Procurar por nome…"}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {tab === "agregados" ? (
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
                    <Button variant="ghost" onClick={() => setAgregadoAbertoId(a.id)}>
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
                { header: "Nº", cell: ({ processo }) => <span className="font-mono text-xs">{processo.numero}</span> },
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
          {!vozLimitada && (
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
          )}
          <h4 className="mb-2 font-display text-base font-medium">Pessoas do agregado</h4>
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
                  ]),
            ]}
          />
        </Modal>
      )}

      {processoAberto && (
        <ProcessoModal
          processo={processoAberto}
          onClose={() => setProcessoAbertoId(null)}
          podeEditar={podeEditar}
          tecnicoAtual={currentUser.nome}
          onRegistarAtendimento={(dados) => {
            addRecord("atendimentos", {
              id: newId("ate"),
              processoId: processoAberto.id,
              ...dados,
            });
          }}
        />
      )}
    </div>
  );
}

function ProcessoModal({
  processo,
  onClose,
  podeEditar,
  tecnicoAtual,
  onRegistarAtendimento,
}: {
  processo: Processo;
  onClose: () => void;
  podeEditar: boolean;
  tecnicoAtual: string;
  onRegistarAtendimento: (dados: Omit<Atendimento, "id" | "processoId">) => void;
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

  return (
    <Modal open onClose={onClose} title={`Processo nº ${processo.numero} — ${pessoa.nome}`} width="max-w-3xl">
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
