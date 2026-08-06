import { useMemo, useState } from "react";
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
  Textarea,
  estadoTone,
} from "../components/ui";
import { formatCurrency, formatDateTime } from "../lib/format";
import { newId } from "../lib/id";
import type { CanalMensagem, Mensagem } from "../types";

const MODELOS: Record<string, string> = {
  "Lembrete de levantamento de cabaz":
    "Centro Social São Nicolau: lembramos que o seu cabaz está disponível amanhã, das 10h às 12h.",
  "Cabaz por levantar":
    "Centro Social São Nicolau: o seu cabaz continua por levantar. Contacte-nos, por favor.",
  "Cartão a caducar": "Centro Social São Nicolau: o seu cartão caduca dentro de dias. Contacte a secretaria.",
  Aniversário: "Centro Social São Nicolau deseja-lhe um feliz aniversário!",
  "Aviso geral": "Centro Social São Nicolau: informamos uma alteração no horário de funcionamento.",
};

const PALAVRAS_SENSIVEIS = ["saúde", "doença", "doente", "dívida", "valor", "€", "diagnóstico", "internad"];

export function Mensagens() {
  const { db, currentUser, addRecord, removeRecord } = useDb();
  const [aberto, setAberto] = useState(false);
  const [aCancelar, setACancelar] = useState<Mensagem | null>(null);

  const mensagens = [...db.mensagens].sort((a, b) => b.agendada.localeCompare(a.agendada));
  const custoMes = mensagens.reduce((s, m) => s + (m.custo ?? 0), 0);

  return (
    <div>
      <SectionHeading
        title="Mensagens"
        actions={
          <Button variant="primary" onClick={() => setAberto(true)}>
            + Nova mensagem
          </Button>
        }
      />


      <Card title="Fila e histórico" subtitle={`Custo acumulado: ${formatCurrency(custoMes)}`}>
        <DataTable
          rowKey={(m) => m.id}
          rows={mensagens}
          columns={[
            {
              header: "Destinatário",
              cell: (m) => {
                const proc = db.processos.find((p) => p.id === m.processoId);
                return db.pessoas.find((p) => p.id === proc?.pessoaId)?.nome ?? "—";
              },
            },
            { header: "Canal", cell: (m) => m.canal },
            { header: "Modelo", cell: (m) => <span className="text-ink-soft">{m.modelo}</span> },
            { header: "Agendada", cell: (m) => formatDateTime(m.agendada) },
            { header: "Estado", cell: (m) => <Badge tone={estadoTone(m.estadoEntrega)}>{m.estadoEntrega}</Badge> },
            {
              header: "",
              align: "right",
              cell: (m) =>
                m.estadoEntrega === "Falhou" ? (
                  <span className="text-xs font-medium text-brick-600">☎ ligar à pessoa</span>
                ) : m.estadoEntrega === "Sem consentimento" ? (
                  <span className="text-xs text-ink-soft">bloqueada — sem consentimento</span>
                ) : m.estadoEntrega === "Agendada" ? (
                  <Button variant="ghost" className="text-brick-600 hover:bg-brick-50" onClick={() => setACancelar(m)}>
                    Cancelar
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>

      <Modal open={!!aCancelar} onClose={() => setACancelar(null)} title="Cancelar envio">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Tem a certeza de que quer cancelar esta mensagem agendada
            {aCancelar && (
              <>
                {" "}para{" "}
                <strong className="text-ink">
                  {(() => {
                    const proc = db.processos.find((p) => p.id === aCancelar.processoId);
                    return db.pessoas.find((p) => p.id === proc?.pessoaId)?.nome ?? "—";
                  })()}
                </strong>
              </>
            )}
            ? Ainda não foi enviada, por isso o registo é removido por completo.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setACancelar(null)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (aCancelar) removeRecord("mensagens", aCancelar.id);
                setACancelar(null);
              }}
            >
              Cancelar envio
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Nova mensagem" width="max-w-xl">
        <NovaMensagem
          onFechar={() => setAberto(false)}
          onEnviar={(msgs) => {
            msgs.forEach((m) => addRecord("mensagens", m));
            setAberto(false);
          }}
          registadoPor={currentUser.nome}
        />
      </Modal>
    </div>
  );
}

type ModoDestinatario = "um" | "todos";
type QuandoEnviar = "agendar" | "agora";

function NovaMensagem({
  onFechar,
  onEnviar,
  registadoPor,
}: {
  onFechar: () => void;
  onEnviar: (msgs: Mensagem[]) => void;
  registadoPor: string;
}) {
  const { db } = useDb();
  const [modo, setModo] = useState<ModoDestinatario>("um");
  const processosOrdenados = useMemo(
    () =>
      [...db.processos].sort((a, b) =>
        (db.pessoas.find((pe) => pe.id === a.pessoaId)?.nome ?? "").localeCompare(
          db.pessoas.find((pe) => pe.id === b.pessoaId)?.nome ?? "",
          "pt-PT"
        )
      ),
    [db.processos, db.pessoas]
  );
  const [processoId, setProcessoId] = useState(processosOrdenados[0]?.id ?? "");
  const [canal, setCanal] = useState<CanalMensagem>("SMS");
  const [modeloNome, setModeloNome] = useState("Lembrete de levantamento de cabaz");
  const [conteudo, setConteudo] = useState(MODELOS["Lembrete de levantamento de cabaz"]);
  const [quando, setQuando] = useState<QuandoEnviar>("agendar");
  const [agendada, setAgendada] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  const pessoa = useMemo(() => {
    const proc = db.processos.find((p) => p.id === processoId);
    return db.pessoas.find((p) => p.id === proc?.pessoaId) ?? null;
  }, [db, processoId]);

  const contactoCanal = pessoa
    ? db.contactos.find(
        (c) => c.pessoaId === pessoa.id && (canal === "SMS" ? c.tipo === "Telemóvel" : c.tipo === "Email")
      )
    : null;

  const semContacto = !contactoCanal;
  const semConsentimento = semContacto || !contactoCanal.consentimento;
  const contemSensivel = canal === "SMS" && PALAVRAS_SENSIVEIS.some((p) => conteudo.toLowerCase().includes(p));

  // Modo "todos" — só processos ativos, um a um verificados contra contacto
  // e consentimento, tal como um envio individual verificaria.
  const processosAtivos = useMemo(() => db.processos.filter((p) => p.estado === "Ativo"), [db.processos]);
  const avaliacaoTodos = useMemo(() => {
    return processosAtivos.map((p) => {
      const pe = db.pessoas.find((pessoa) => pessoa.id === p.pessoaId) ?? null;
      const contacto = pe
        ? db.contactos.find(
            (c) => c.pessoaId === pe.id && (canal === "SMS" ? c.tipo === "Telemóvel" : c.tipo === "Email")
          )
        : null;
      const semContactoP = !contacto;
      const semConsentimentoP = semContactoP || !contacto.consentimento;
      return { processo: p, pessoa: pe, elegivel: !semConsentimentoP, semContactoP, semConsentimentoP };
    });
  }, [processosAtivos, db.pessoas, db.contactos, canal]);
  const elegiveisTodos = avaliacaoTodos.filter((d) => d.elegivel);
  const semContactoTodos = avaliacaoTodos.filter((d) => d.semContactoP).length;
  const semConsentimentoTodos = avaliacaoTodos.filter((d) => !d.semContactoP && d.semConsentimentoP).length;

  const podeEnviar = modo === "um" ? !semConsentimento : elegiveisTodos.length > 0;

  function construirMensagem(procId: string): Mensagem {
    const agora = new Date().toISOString();
    return {
      id: newId("msg"),
      processoId: procId,
      canal,
      modelo: modeloNome,
      conteudoFinal: conteudo,
      agendada: quando === "agora" ? agora : agendada,
      enviada: quando === "agora" ? agora : null,
      estadoEntrega: quando === "agora" ? "Enviada" : "Agendada",
      resposta: null,
      custo: canal === "SMS" ? 0.05 : 0,
    };
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border border-pine-900/15 bg-paper p-1">
        {(["um", "todos"] as ModoDestinatario[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              modo === m ? "bg-pine-800 text-pine-50" : "text-ink-soft hover:text-ink"
            }`}
          >
            {m === "um" ? "Um destinatário" : "Todos os processos ativos"}
          </button>
        ))}
      </div>

      {modo === "um" ? (
        <Field label="Destinatário (processo)">
          <Select value={processoId} onChange={(e) => setProcessoId(e.target.value)}>
            {processosOrdenados.map((p) => (
              <option key={p.id} value={p.id}>
                nº {p.numero} — {db.pessoas.find((pe) => pe.id === p.pessoaId)?.nome}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Callout tone={elegiveisTodos.length > 0 ? "pine" : "brick"} title="Envio em massa">
          {elegiveisTodos.length} de {processosAtivos.length} processos ativos vão receber esta
          mensagem por {canal === "SMS" ? "SMS" : "email"}.
          {(semContactoTodos > 0 || semConsentimentoTodos > 0) && (
            <>
              {" "}
              Ficam de fora: {semContactoTodos} sem {canal === "SMS" ? "telemóvel" : "email"} registado
              {semConsentimentoTodos > 0 && `, ${semConsentimentoTodos} sem consentimento`}.
            </>
          )}
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Canal">
          <Select value={canal} onChange={(e) => setCanal(e.target.value as CanalMensagem)}>
            <option>SMS</option>
            <option>Email</option>
          </Select>
        </Field>
        <Field label="Modelo">
          <Select
            value={modeloNome}
            onChange={(e) => {
              setModeloNome(e.target.value);
              setConteudo(MODELOS[e.target.value]);
            }}
          >
            {Object.keys(MODELOS).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Conteúdo final">
        <Textarea rows={3} value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
      </Field>

      <Field label="Quando enviar">
        <div className="flex gap-1 rounded-lg border border-pine-900/15 bg-paper p-1">
          {(["agendar", "agora"] as QuandoEnviar[]).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuando(q)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                quando === q ? "bg-pine-800 text-pine-50" : "text-ink-soft hover:text-ink"
              }`}
            >
              {q === "agendar" ? "Agendar para mais tarde" : "Enviar agora"}
            </button>
          ))}
        </div>
      </Field>

      {quando === "agendar" ? (
        <Field label="Agendada para" hint="As mensagens saem sempre à mesma hora, para haver tempo de travar um erro.">
          <Input type="datetime-local" value={agendada} onChange={(e) => setAgendada(e.target.value)} />
        </Field>
      ) : (
        <p className="text-xs text-ink-soft">
          Fica marcada como enviada de imediato, ao confirmar — sem espera nem hora agendada.
        </p>
      )}

      {modo === "um" && semContacto && (
        <Callout tone="brick" title="Sem contacto registado">
          Esta pessoa não tem {canal === "SMS" ? "telemóvel" : "email"} registado. A mensagem não pode
          ser enviada — adicione o contacto na ficha da pessoa, em Porta Aberta.
        </Callout>
      )}
      {modo === "um" && !semContacto && semConsentimento && (
        <Callout tone="brick" title="Sem consentimento">
          Esta pessoa não deu consentimento para contacto por {canal === "SMS" ? "telemóvel" : "email"}.
          A mensagem não pode ser enviada.
        </Callout>
      )}
      {(modo === "todos" || !semConsentimento) && contemSensivel && (
        <Callout tone="terracotta" title="Possível assunto delicado">
          O texto parece conter informação sensível (saúde, valores, situação da família). Reveja
          antes de enviar — nada disto deve ir por SMS.
        </Callout>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          disabled={!podeEnviar}
          onClick={() =>
            onEnviar(
              modo === "um"
                ? [construirMensagem(processoId)]
                : elegiveisTodos.map((d) => construirMensagem(d.processo.id))
            )
          }
        >
          {(() => {
            const verbo = quando === "agora" ? "Enviar agora" : "Agendar envio";
            return modo === "um" ? verbo : `${verbo} (${elegiveisTodos.length} pessoas)`;
          })()}
        </Button>
      </div>
      <p className="text-right text-xs text-ink-soft">registada por {registadoPor}</p>
    </div>
  );
}
