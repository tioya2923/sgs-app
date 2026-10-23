import { useState, type FormEvent } from "react";
import { useDb } from "../store/db";
import { Button, Field, PasswordInput } from "./ui";

const MINIMO = 10;

/** Ecrã obrigatório no primeiro acesso: a palavra-passe inicial tem de ser mudada. */
export function TrocarPassword() {
  const { trocarPassword, logout, currentUser } = useDb();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);

  const curta = nova.length > 0 && nova.length < MINIMO;
  const diferentes = confirmar.length > 0 && nova !== confirmar;
  const podeGuardar = atual && nova.length >= MINIMO && nova === confirmar && !aGuardar;

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setAGuardar(true);
    const resultado = await trocarPassword(atual, nova);
    setAGuardar(false);
    if (resultado) setErro(resultado);
  }

  return (
    <div className="paper-grain flex min-h-svh items-center justify-center bg-pine-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-pine-50/10 bg-paper-raised p-8 shadow-2xl">
        <h1 className="font-display text-xl font-semibold text-ink">Escolha uma palavra-passe nova</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Olá, {currentUser.nome}. Por segurança, a palavra-passe inicial tem de ser mudada antes de continuar.
        </p>
        <form className="mt-5 space-y-4" onSubmit={submeter}>
          <Field label="Palavra-passe atual">
            <PasswordInput autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
          </Field>
          <Field label="Nova palavra-passe" hint={`Pelo menos ${MINIMO} caracteres.`}>
            <PasswordInput autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
          </Field>
          <Field label="Confirmar nova palavra-passe">
            <PasswordInput autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
          </Field>
          {(curta || diferentes || erro) && (
            <p role="alert" className="rounded-lg bg-brick-50 px-3 py-2 text-sm text-brick-700">
              {erro ?? (curta ? `A palavra-passe precisa de pelo menos ${MINIMO} caracteres.` : "As duas palavras-passe têm de ser iguais.")}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full justify-center" disabled={!podeGuardar}>
            Guardar e continuar
          </Button>
          <button type="button" onClick={() => void logout()} className="w-full text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-ink">
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
