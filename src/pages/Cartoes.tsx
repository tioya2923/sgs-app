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
  estadoTone,
} from "../components/ui";
import { diasAte, formatCurrency, formatDate } from "../lib/format";
import { newId } from "../lib/id";
import type { Cartao } from "../types";

const ORIGENS_FUNDO_BASE = ["Câmara Municipal de Lisboa", "Fundo paroquial", "Doação privada"];

function estadoEfetivo(c: Cartao): string {
  // O estado gravado só muda por ação humana — um cartão Ativo cuja validade
  // já passou continua "Ativo" nos dados, mas mostra-se como Expirado.
  if (c.estado === "Ativo" && diasAte(c.validade) < 0) return "Expirado";
  return c.estado;
}

export function Cartoes() {
  const { db, currentUser, hasPerfil, addRecord, updateRecord } = useDb();
  const podeGerir = hasPerfil("Direção", "Administrativo");
  const [aberto, setAberto] = useState(false);
  const [aCancelar, setACancelar] = useState<Cartao | null>(null);

  const cartoes = [...db.cartoes].sort((a, b) => b.carregadoEm.localeCompare(a.carregadoEm));

  return (
    <div>
      <SectionHeading
        title="Cartões Pingo Doce"
        actions={
          podeGerir && (
            <Button variant="primary" onClick={() => setAberto(true)}>
              + Atribuir cartão
            </Button>
          )
        }
      />

      <Card title="Cartões emitidos">
        <DataTable
          rowKey={(c) => c.id}
          rows={cartoes}
          columns={[
            { header: "Número", cell: (c) => <span className="font-mono text-xs">{c.numero}</span> },
            {
              header: "Beneficiário",
              cell: (c) => {
                const proc = db.processos.find((p) => p.id === c.processoId);
                return db.pessoas.find((p) => p.id === proc?.pessoaId)?.nome ?? "—";
              },
            },
            { header: "Valor", cell: (c) => formatCurrency(c.valor), align: "right" },
            { header: "Origem do fundo", cell: (c) => <span className="text-ink-soft">{c.origemFundo}</span> },
            {
              header: "Validade",
              cell: (c) => {
                const dias = diasAte(c.validade);
                const aproximaOuPassou = c.estado === "Ativo" && dias <= 7;
                return (
                  <span className={aproximaOuPassou ? "font-medium text-terracotta-600" : ""}>
                    {formatDate(c.validade)}
                  </span>
                );
              },
            },
            {
              header: "Prova de receção",
              cell: (c) => (c.provaRececao ? <Badge tone="pine">Sim</Badge> : <Badge tone="neutral">Não</Badge>),
            },
            {
              header: "Estado",
              cell: (c) => <Badge tone={estadoTone(estadoEfetivo(c))}>{estadoEfetivo(c)}</Badge>,
            },
            {
              header: "",
              align: "right",
              cell: (c) =>
                podeGerir && (c.estado === "Por entregar" || c.estado === "Ativo") ? (
                  <div className="flex justify-end gap-1.5">
                    {c.estado === "Por entregar" && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const proc = db.processos.find((p) => p.id === c.processoId);
                          const pessoa = db.pessoas.find((p) => p.id === proc?.pessoaId);
                          updateRecord("cartoes", c.id, {
                            estado: "Ativo",
                            entregueEm: new Date().toISOString().slice(0, 10),
                            recebidoPor: pessoa?.nome ?? null,
                            provaRececao: true,
                          });
                        }}
                      >
                        Confirmar entrega
                      </Button>
                    )}
                    <Button variant="ghost" className="text-brick-600 hover:bg-brick-50" onClick={() => setACancelar(c)}>
                      Cancelar
                    </Button>
                  </div>
                ) : null,
            },
          ]}
        />
      </Card>

      <Modal open={!!aCancelar} onClose={() => setACancelar(null)} title="Cancelar cartão">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Tem a certeza de que quer cancelar o cartão{" "}
            <strong className="text-ink">{aCancelar?.numero}</strong>? Use isto para cartões perdidos,
            recusados ou emitidos por engano. A ação não pode ser desfeita, mas o registo mantém-se
            como histórico.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setACancelar(null)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (aCancelar) updateRecord("cartoes", aCancelar.id, { estado: "Cancelado" });
                setACancelar(null);
              }}
            >
              Cancelar cartão
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Atribuir novo cartão">
        <FormularioCartao
          registadoPor={currentUser.nome}
          onSubmeter={(cartao) => {
            addRecord("cartoes", cartao);
            setAberto(false);
          }}
        />
      </Modal>
    </div>
  );
}

function FormularioCartao({
  registadoPor,
  onSubmeter,
}: {
  registadoPor: string;
  onSubmeter: (c: ReturnType<typeof useDb>["db"]["cartoes"][number]) => void;
}) {
  const { db } = useDb();
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
  const sugestoesFundo = useMemo(
    () => Array.from(new Set([...ORIGENS_FUNDO_BASE, ...db.cartoes.map((c) => c.origemFundo)])).sort((a, b) =>
      a.localeCompare(b, "pt-PT")
    ),
    [db.cartoes]
  );
  const [processoId, setProcessoId] = useState(processosOrdenados[0]?.id ?? "");
  const [numero, setNumero] = useState("");
  const [valor, setValor] = useState(30);
  const [origemFundo, setOrigemFundo] = useState("Câmara Municipal de Lisboa");
  const [validade, setValidade] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="space-y-3">
      <Field label="Beneficiário (processo)">
        <Select value={processoId} onChange={(e) => setProcessoId(e.target.value)}>
          {processosOrdenados.map((p) => (
            <option key={p.id} value={p.id}>
              nº {p.numero} — {db.pessoas.find((pe) => pe.id === p.pessoaId)?.nome}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Número do cartão">
        <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="PD-100237" />
      </Field>
      <Field label="Valor (€)">
        <Input type="number" min={1} value={valor} onChange={(e) => setValor(Number(e.target.value))} />
      </Field>
      <Field label="Origem do fundo" hint="Sugere origens já usadas, mas pode escrever uma nova.">
        <SuggestInput value={origemFundo} onChange={setOrigemFundo} suggestions={sugestoesFundo} />
      </Field>
      <Field label="Validade">
        <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
      </Field>
      <Button
        variant="primary"
        onClick={() => {
          const proc = db.processos.find((p) => p.id === processoId);
          const pessoa = db.pessoas.find((p) => p.id === proc?.pessoaId);
          onSubmeter({
            id: newId("crt"),
            numero: numero || `PD-${Math.floor(100000 + Math.random() * 900000)}`,
            agregadoId: pessoa?.agregadoId ?? "",
            processoId,
            valor,
            origemFundo,
            carregadoEm: new Date().toISOString().slice(0, 10),
            validade,
            entregueEm: null,
            recebidoPor: null,
            provaRececao: false,
            emitidoPor: registadoPor,
            estado: "Por entregar",
          });
        }}
      >
        Atribuir cartão
      </Button>
    </div>
  );
}
