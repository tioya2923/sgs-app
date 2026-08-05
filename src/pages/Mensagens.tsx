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
  const { db, currentUser, addRecord } = useDb();
  const [aberto, setAberto] = useState(false);

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
              cell: (m) =>
                m.estadoEntrega === "Falhou" ? (
                  <span className="text-xs font-medium text-brick-600">☎ ligar à pessoa</span>
                ) : m.estadoEntrega === "Sem consentimento" ? (
                  <span className="text-xs text-ink-soft">bloqueada — sem consentimento</span>
                ) : null,
            },
          ]}
        />
      </Card>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Nova mensagem" width="max-w-xl">
        <NovaMensagem
          onFechar={() => setAberto(false)}
          onEnviar={(m) => {
            addRecord("mensagens", m);
            setAberto(false);
          }}
          registadoPor={currentUser.nome}
        />
      </Modal>
    </div>
  );
}

function NovaMensagem({
  onFechar,
  onEnviar,
  registadoPor,
}: {
  onFechar: () => void;
  onEnviar: (m: Mensagem) => void;
  registadoPor: string;
}) {
  const { db } = useDb();
  const [processoId, setProcessoId] = useState(db.processos[0]?.id ?? "");
  const [canal, setCanal] = useState<CanalMensagem>("SMS");
  const [modeloNome, setModeloNome] = useState("Lembrete de levantamento de cabaz");
  const [conteudo, setConteudo] = useState(MODELOS["Lembrete de levantamento de cabaz"]);
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

  const semConsentimento = contactoCanal ? !contactoCanal.consentimento : true;
  const contemSensivel = canal === "SMS" && PALAVRAS_SENSIVEIS.some((p) => conteudo.toLowerCase().includes(p));

  return (
    <div className="space-y-3">
      <Field label="Destinatário (processo)">
        <Select value={processoId} onChange={(e) => setProcessoId(e.target.value)}>
          {db.processos.map((p) => (
            <option key={p.id} value={p.id}>
              nº {p.numero} — {db.pessoas.find((pe) => pe.id === p.pessoaId)?.nome}
            </option>
          ))}
        </Select>
      </Field>

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

      <Field label="Agendada para" hint="As mensagens saem sempre à mesma hora, para haver tempo de travar um erro.">
        <Input type="datetime-local" value={agendada} onChange={(e) => setAgendada(e.target.value)} />
      </Field>

      {semConsentimento && (
        <Callout tone="brick" title="Sem consentimento">
          Esta pessoa não deu consentimento para contacto por {canal === "SMS" ? "telemóvel" : "email"}.
          A mensagem não pode ser enviada — nem em envios feitos a toda a gente de uma vez.
        </Callout>
      )}
      {!semConsentimento && contemSensivel && (
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
          disabled={semConsentimento}
          onClick={() =>
            onEnviar({
              id: newId("msg"),
              processoId,
              canal,
              modelo: modeloNome,
              conteudoFinal: conteudo,
              agendada,
              enviada: null,
              estadoEntrega: "Agendada",
              resposta: null,
              custo: canal === "SMS" ? 0.05 : 0,
            })
          }
        >
          Agendar envio
        </Button>
      </div>
      <p className="text-right text-xs text-ink-soft">registada por {registadoPor}</p>
    </div>
  );
}
