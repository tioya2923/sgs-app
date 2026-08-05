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
  estadoTone,
} from "../components/ui";
import { diasAte, formatCurrency, formatDate } from "../lib/format";
import { newId } from "../lib/id";

export function Cartoes() {
  const { db, currentUser, hasPerfil, addRecord, updateRecord } = useDb();
  const podeGerir = hasPerfil("Direção", "Administrativo");
  const [aberto, setAberto] = useState(false);

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
                return (
                  <span className={dias <= 7 && c.estado === "Ativo" ? "font-medium text-terracotta-600" : ""}>
                    {formatDate(c.validade)}
                  </span>
                );
              },
            },
            {
              header: "Prova de receção",
              cell: (c) => (c.provaRececao ? <Badge tone="pine">Sim</Badge> : <Badge tone="neutral">Não</Badge>),
            },
            { header: "Estado", cell: (c) => <Badge tone={estadoTone(c.estado)}>{c.estado}</Badge> },
            {
              header: "",
              align: "right",
              cell: (c) =>
                podeGerir && c.estado === "Por entregar" ? (
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
                ) : null,
            },
          ]}
        />
      </Card>

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
  const [processoId, setProcessoId] = useState(db.processos[0]?.id ?? "");
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
          {db.processos.map((p) => (
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
      <Field label="Origem do fundo">
        <Select value={origemFundo} onChange={(e) => setOrigemFundo(e.target.value)}>
          <option>Câmara Municipal de Lisboa</option>
          <option>Fundo paroquial</option>
          <option>Doação privada</option>
        </Select>
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
