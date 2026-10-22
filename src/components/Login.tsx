import { useState, type FormEvent } from "react";
import { useDb } from "../store/db";
import { Button, Field, Input, PasswordInput } from "./ui";

export function Login() {
  const { login } = useDb();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aEntrar, setAEntrar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setAEntrar(true);
    const resultado = await login(email, password);
    setAEntrar(false);
    if (resultado) {
      setErro(resultado);
      setPassword("");
    }
  }

  return (
    <div className="paper-grain flex min-h-svh items-center justify-center bg-pine-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-pine-50/10 bg-paper-raised p-8 shadow-2xl">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-pine-600">
          Centro Social Paroquial
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">São Nicolau</h1>
        <p className="mt-2 text-xs leading-snug text-ink-soft">
          Sistema de Gestão Social · Baixa de Lisboa
        </p>

        <form className="mt-6 space-y-4" onSubmit={submeter}>
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </Field>
          <Field label="Palavra-passe">
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {erro && (
            <p role="alert" className="rounded-lg bg-brick-50 px-3 py-2 text-sm text-brick-700">
              {erro}
            </p>
          )}

          <Button type="submit" variant="primary" className="w-full justify-center" disabled={aEntrar}>
            {aEntrar ? "A entrar…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-soft">
          Acesso reservado à equipa e voluntariado do centro.
        </p>
      </div>
    </div>
  );
}
