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
  PasswordInput,
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
  { dispositivo: "Tablet", faz: "Todos os módulos" },
  { dispositivo: "Telemóvel", faz: "Todos os módulos" },
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
  const [aEditar, setAEditar] = useState<Utilizador | null>(null);

  const direcoesAtivas = db.utilizadores.filter((u) => u.perfil === "Direção" && u.ativo).length;
  // Esta é a única Direção ativa: qualquer perda de acesso desta conta (remoção,
  // desativação ou mudança de perfil) deixaria a Administração sem ninguém que a
  // pudesse repor. As três ações abaixo partilham por isso a mesma verificação.
  const ehUnicaDirecaoAtiva = (u: Utilizador) => u.perfil === "Direção" && u.ativo && direcoesAtivas <= 1;

  function podeRemover(u: Utilizador): true | string {
    if (u.id === currentUser.id) return "Não pode remover-se a si próprio.";
    if (ehUnicaDirecaoAtiva(u)) return "Tem de haver sempre pelo menos uma Direção ativa.";
    return true;
  }

  function podeDesativar(u: Utilizador): true | string {
    if (u.id === currentUser.id) return "Não pode desativar-se a si próprio.";
    if (ehUnicaDirecaoAtiva(u)) return "Tem de haver sempre pelo menos uma Direção ativa.";
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
              cell: (u) => {
                // Só a passagem para "Inativo" precisa de verificação — reativar nunca é perigoso.
                const motivo = u.ativo ? podeDesativar(u) : true;
                return (
                  <button
                    disabled={motivo !== true}
                    title={motivo === true ? undefined : motivo}
                    onClick={() => updateRecord("utilizadores", u.id, { ativo: !u.ativo })}
                    className="disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Badge tone={u.ativo ? "pine" : "brick"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
                  </button>
                );
              },
            },
            {
              header: "",
              align: "right",
              cell: (u) => {
                const motivo = podeRemover(u);
                return (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => setAEditar(u)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={motivo !== true}
                      title={motivo === true ? undefined : motivo}
                      onClick={() => setARemover(u)}
                      className="text-brick-600 hover:bg-brick-50 disabled:text-ink-soft"
                    >
                      Remover
                    </Button>
                  </div>
                );
              },
            },
          ]}
        />
      </Card>

      <Modal open={!!aEditar} onClose={() => setAEditar(null)} title="Editar utilizador">
        {aEditar && (
          <EditarUtilizadorForm
            utilizador={aEditar}
            bloquearRebaixamento={ehUnicaDirecaoAtiva(aEditar)}
            onGuardar={(patch) => {
              updateRecord("utilizadores", aEditar.id, patch);
              setAEditar(null);
            }}
          />
        )}
      </Modal>

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

      <Card title="Níveis de acesso" className="mt-5">
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

      <Card title="Dispositivos" className="mt-5">
        <DataTable
          rowKey={(r) => r.dispositivo}
          rows={DISPOSITIVOS}
          columns={[
            { header: "Dispositivo", cell: (r) => r.dispositivo },
            { header: "O que faz", cell: (r) => <span className="text-ink-soft">{r.faz}</span> },
          ]}
        />
      </Card>

      <Card title="Registo de acessos" className="mt-5">
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

function EditarUtilizadorForm({
  utilizador,
  bloquearRebaixamento,
  onGuardar,
}: {
  utilizador: Utilizador;
  bloquearRebaixamento: boolean;
  onGuardar: (patch: Partial<Utilizador>) => void;
}) {
  const [nome, setNome] = useState(utilizador.nome);
  const [email, setEmail] = useState(utilizador.email);
  const [perfil, setPerfil] = useState<Perfil>(utilizador.perfil);
  const [novaPassword, setNovaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");

  const rebaixando = bloquearRebaixamento && perfil !== "Direção";
  const passwordsDiferentes = novaPassword.trim() !== "" && novaPassword !== confirmarPassword;
  const podeGuardar = nome.trim() && email.trim() && !rebaixando && !passwordsDiferentes;

  return (
    <div className="space-y-3">
      <Field label="Nome">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Perfil">
        <Select value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
          {PERFIS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
      </Field>
      {rebaixando && (
        <p className="text-sm text-brick-600">
          Esta é a única Direção ativa — mude primeiro outra pessoa para Direção antes de tirar este
          perfil a {utilizador.nome}.
        </p>
      )}
      <Field label="Nova palavra-passe" hint="Deixe em branco para manter a palavra-passe atual.">
        <PasswordInput value={novaPassword} onChange={(e) => setNovaPassword(e.target.value)} />
      </Field>
      {novaPassword.trim() && (
        <Field label="Confirmar nova palavra-passe">
          <PasswordInput value={confirmarPassword} onChange={(e) => setConfirmarPassword(e.target.value)} />
        </Field>
      )}
      {passwordsDiferentes && (
        <p className="text-sm text-brick-600">As duas palavras-passe têm de ser iguais.</p>
      )}
      <Button
        variant="primary"
        disabled={!podeGuardar}
        onClick={() =>
          onGuardar({
            nome: nome.trim(),
            email: email.trim(),
            perfil,
            ...(novaPassword.trim() ? { password: novaPassword.trim() } : {}),
          })
        }
      >
        Guardar alterações
      </Button>
    </div>
  );
}

function NovoUtilizador({ onCriar }: { onCriar: (u: ReturnType<typeof useDb>["db"]["utilizadores"][number]) => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("Técnico de ação social");

  const passwordsDiferentes = password !== confirmarPassword;
  const podeCriar = nome.trim() && email.trim() && password.trim() && !passwordsDiferentes;

  return (
    <div className="space-y-3">
      <Field label="Nome">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Palavra-passe inicial" hint="A pessoa deve alterá-la assim que entrar pela primeira vez.">
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirmar palavra-passe">
        <PasswordInput value={confirmarPassword} onChange={(e) => setConfirmarPassword(e.target.value)} />
      </Field>
      {passwordsDiferentes && confirmarPassword && (
        <p className="text-sm text-brick-600">As duas palavras-passe têm de ser iguais.</p>
      )}
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
