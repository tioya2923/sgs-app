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
} from "../components/ui";
import { formatDate, formatDateTime } from "../lib/format";
import { newId } from "../lib/id";
import type { Perfil, Utilizador } from "../types";

const NIVEIS_ACESSO: { perfil: string; ve: string; edita: string }[] = [
  { perfil: "Direção", ve: "Tudo", edita: "Tudo e configuração" },
  { perfil: "Técnico de ação social", ve: "Processos completos", edita: "Fichas, programas, acompanhamento, mensagens" },
  { perfil: "Voluntário — distribuição", ve: "Nome, número, modelo de cabaz", edita: "Só registo de entrega" },
  { perfil: "Cozinha", ve: "Contagens e restrições alimentares", edita: "Presenças, ementa, saídas para cozinha" },
  { perfil: "Armazém", ve: "Existências e movimentos", edita: "Entradas, saídas, transferências" },
  { perfil: "Administrativo", ve: "Cartões, relatórios", edita: "Cartões" },
];

const DISPOSITIVOS: { dispositivo: string; faz: string }[] = [
  { dispositivo: "Computador", faz: "Todos os módulos" },
  { dispositivo: "Tablet", faz: "Distribuição, presenças, existências, entradas" },
  { dispositivo: "Telemóvel", faz: "Consulta, presenças e alertas. Não montagem de cabazes" },
];

const PERFIS: Perfil[] = [
  "Direção",
  "Técnico de ação social",
  "Voluntário — distribuição",
  "Cozinha",
  "Armazém",
  "Administrativo",
];

export function Administracao() {
  const { db, currentUser, addRecord, updateRecord, removeRecord } = useDb();
  const [aberto, setAberto] = useState(false);
  const [aRemover, setARemover] = useState<Utilizador | null>(null);

  const direcoesAtivas = db.utilizadores.filter((u) => u.perfil === "Direção" && u.ativo).length;

  function podeRemover(u: Utilizador): true | string {
    if (u.id === currentUser.id) return "Não pode remover-se a si próprio.";
    if (u.perfil === "Direção" && u.ativo && direcoesAtivas <= 1) {
      return "Tem de haver sempre pelo menos uma Direção ativa.";
    }
    return true;
  }

  return (
    <div>
      <SectionHeading title="Administração" />

      <Card
        title="Utilizadores"
        actions={
          <Button variant="primary" onClick={() => setAberto(true)}>
            + Novo utilizador
          </Button>
        }
      >
        <DataTable
          rowKey={(u) => u.id}
          rows={db.utilizadores}
          columns={[
            { header: "Nome", cell: (u) => u.nome },
            { header: "Perfil", cell: (u) => <Badge>{u.perfil}</Badge> },
            { header: "Email", cell: (u) => <span className="text-ink-soft">{u.email}</span> },
            { header: "Último acesso", cell: (u) => formatDate(u.ultimoAcesso) },
            {
              header: "Estado",
              cell: (u) => (
                <button onClick={() => updateRecord("utilizadores", u.id, { ativo: !u.ativo })}>
                  <Badge tone={u.ativo ? "pine" : "brick"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
                </button>
              ),
            },
            {
              header: "",
              align: "right",
              cell: (u) => {
                const motivo = podeRemover(u);
                return (
                  <Button
                    variant="ghost"
                    disabled={motivo !== true}
                    title={motivo === true ? undefined : motivo}
                    onClick={() => setARemover(u)}
                    className="text-brick-600 hover:bg-brick-50 disabled:text-ink-soft"
                  >
                    Remover
                  </Button>
                );
              },
            },
          ]}
        />
      </Card>

      <Modal open={!!aRemover} onClose={() => setARemover(null)} title="Remover utilizador">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Tem a certeza de que quer remover <strong className="text-ink">{aRemover?.nome}</strong>{" "}
            ({aRemover?.perfil})? Esta pessoa deixa de conseguir entrar no sistema. A ação não pode ser
            desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setARemover(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (aRemover) removeRecord("utilizadores", aRemover.id);
                setARemover(null);
              }}
            >
              Remover utilizador
            </Button>
          </div>
        </div>
      </Modal>

      <Card title="Níveis de acesso" subtitle="Secção 6.1" className="mt-5">
        <DataTable
          rowKey={(r) => r.perfil}
          rows={NIVEIS_ACESSO}
          columns={[
            { header: "Perfil", cell: (r) => r.perfil },
            { header: "Vê", cell: (r) => <span className="text-ink-soft">{r.ve}</span> },
            { header: "Edita", cell: (r) => <span className="text-ink-soft">{r.edita}</span> },
          ]}
        />
      </Card>

      <Card title="Dispositivos" subtitle="Secção 6.2" className="mt-5">
        <DataTable
          rowKey={(r) => r.dispositivo}
          rows={DISPOSITIVOS}
          columns={[
            { header: "Dispositivo", cell: (r) => r.dispositivo },
            { header: "O que faz", cell: (r) => <span className="text-ink-soft">{r.faz}</span> },
          ]}
        />
      </Card>

      <Card title="Proteção de dados" subtitle="Secção 6.3" className="mt-5">
        <ul className="mb-4 list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>Autorização pedida a cada pessoa e para cada meio de contacto, com data, renovada anualmente.</li>
          <li>Recolher apenas o que é realmente usado para decidir o apoio, e nada mais.</li>
          <li>Registo de quem abriu cada processo e em que dia.</li>
          <li>Prazos para guardar cada tipo de dado, e apagar a identificação quando o caso é encerrado.</li>
          <li>Ficheiros exportados saem sem nomes, salvo se alguém indicar o contrário.</li>
          <li>Quem for apoiado pode consultar, corrigir ou pedir para apagar os seus dados.</li>
        </ul>
      </Card>

      <Card title="Registo de acessos" subtitle="Auditoria RGPD" className="mt-5">
        <DataTable
          rowKey={(r) => r.id}
          rows={[...db.registosAcesso].sort((a, b) => b.dataHora.localeCompare(a.dataHora))}
          columns={[
            { header: "Data e hora", cell: (r) => formatDateTime(r.dataHora) },
            { header: "Utilizador", cell: (r) => r.utilizador },
            { header: "Ação", cell: (r) => r.acao },
            { header: "Entidade", cell: (r) => <span className="text-ink-soft">{r.entidade}</span> },
          ]}
        />
      </Card>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Novo utilizador">
        <NovoUtilizador
          onCriar={(u) => {
            addRecord("utilizadores", u);
            setAberto(false);
          }}
        />
      </Modal>
    </div>
  );
}

function NovoUtilizador({ onCriar }: { onCriar: (u: ReturnType<typeof useDb>["db"]["utilizadores"][number]) => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("Técnico de ação social");

  const podeCriar = nome.trim() && email.trim() && password.trim();

  return (
    <div className="space-y-3">
      <Field label="Nome">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Palavra-passe inicial" hint="A pessoa deve alterá-la assim que entrar pela primeira vez.">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Perfil">
        <Select value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
          {PERFIS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
      </Field>
      <Button
        variant="primary"
        disabled={!podeCriar}
        onClick={() =>
          onCriar({
            id: newId("usr"),
            nome,
            perfil,
            email,
            password,
            ativo: true,
            ultimoAcesso: null,
          })
        }
      >
        Criar utilizador
      </Button>
    </div>
  );
}
