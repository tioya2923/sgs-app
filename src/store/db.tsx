import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database, Perfil, Utilizador } from "../types";
import { ApiError, api, aoSessaoExpirar, auth, definirToken, renovarSessao, type UtilizadorApi } from "../services/api";

const BASE_VAZIA: Database = {
  agregados: [], pessoas: [], processos: [], contactos: [], documentos: [], inscricoes: [], atendimentos: [],
  armazens: [], artigos: [], lotes: [], movimentos: [], modelosCabaz: [], entregasCabaz: [], entregasRoupa: [],
  refeicoesContagem: [], refeicoesPresenca: [], cartoes: [], alertas: [], mensagens: [], registosAcesso: [],
  utilizadores: [],
};

type Estado = "a-carregar" | "anonimo" | "autenticado";

interface DbContextValue {
  /** Dados que o perfil atual pode ver, já filtrados pelo servidor. */
  db: Database;
  carregado: boolean;
  currentUser: Utilizador;
  /** id do utilizador com sessão iniciada, ou null. */
  session: string | null;
  estado: Estado;
  /** A conta ainda tem a palavra-passe inicial: tem de a mudar antes de usar a app. */
  precisaTrocarPassword: boolean;
  /** Devolve a mensagem de erro, ou null se o login correu bem. */
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  trocarPassword: (atual: string, nova: string) => Promise<string | null>;
  hasPerfil: (...perfis: Perfil[]) => boolean;
  /**
   * Executa uma operação na API e, se correr bem, volta a carregar os dados.
   * Os erros (stock insuficiente, sem permissão…) ficam em `erro` para mostrar ao utilizador.
   */
  executar: <T>(operacao: () => Promise<T>) => Promise<T | undefined>;
  recarregar: () => Promise<void>;
  erro: string | null;
  limparErro: () => void;
}

const DbContext = createContext<DbContextValue | null>(null);

const SEM_UTILIZADOR: Utilizador = {
  id: "", nome: "", perfil: "Voluntário — distribuição", email: "", ativo: false, ultimoAcesso: null,
};

function paraUtilizador(u: UtilizadorApi): Utilizador {
  return { ...u, perfil: u.perfil as Perfil };
}

// Versões anteriores guardavam todos os dados (e as palavras-passe) em localStorage.
// Agora vivem no servidor: apaga-se o que ficou nos browsers para não deixar dados pessoais para trás.
for (const chave of ["sgs-sao-nicolau:db:v1", "sgs-sao-nicolau:db:v2", "sgs-sao-nicolau:sessao", "sgs-sao-nicolau:sessao:v2"]) {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* localStorage indisponível */
  }
}

function DbProviderInterno({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [estado, setEstado] = useState<Estado>("a-carregar");
  const [utilizador, setUtilizador] = useState<Utilizador | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const terminarSessaoLocal = useCallback(() => {
    definirToken(null);
    setUtilizador(null);
    setEstado("anonimo");
    client.clear();
  }, [client]);

  // Ao abrir a app: se o cookie de refresh ainda for válido, a sessão continua.
  useEffect(() => {
    let ativo = true;
    aoSessaoExpirar(() => {
      if (ativo) terminarSessaoLocal();
    });
    renovarSessao().then((dados) => {
      if (!ativo) return;
      if (dados) {
        setUtilizador(paraUtilizador(dados.utilizador));
        setEstado("autenticado");
      } else {
        setEstado("anonimo");
      }
    });
    return () => {
      ativo = false;
      aoSessaoExpirar(null);
    };
  }, [terminarSessaoLocal]);

  const precisaTrocarPassword = Boolean(utilizador?.mustChangePassword);

  const bootstrap = useQuery({
    queryKey: ["bootstrap", utilizador?.id],
    queryFn: () => api.get<Database>("/bootstrap"),
    enabled: estado === "autenticado" && !precisaTrocarPassword,
    staleTime: 30_000,
  });

  const recarregar = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ["bootstrap"] });
  }, [client]);

  const executar = useCallback<DbContextValue["executar"]>(
    async (operacao) => {
      setErro(null);
      try {
        const resultado = await operacao();
        await recarregar();
        return resultado;
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : "Ocorreu um erro inesperado.");
        // Se a operação falhou por o estado ter mudado (ex.: stock), mostra os dados atuais.
        await recarregar().catch(() => undefined);
        return undefined;
      }
    },
    [recarregar],
  );

  const login = useCallback<DbContextValue["login"]>(async (email, password) => {
    try {
      const u = await auth.login(email, password);
      setUtilizador(paraUtilizador(u));
      setEstado("autenticado");
      setErro(null);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "Não foi possível iniciar sessão.";
    }
  }, []);

  const logout = useCallback(async () => {
    await auth.logout().catch(() => undefined);
    terminarSessaoLocal();
  }, [terminarSessaoLocal]);

  const trocarPassword = useCallback<DbContextValue["trocarPassword"]>(async (atual, nova) => {
    try {
      await auth.trocarPassword(atual, nova);
      setUtilizador((u) => (u ? { ...u, mustChangePassword: false } : u));
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "Não foi possível mudar a palavra-passe.";
    }
  }, []);

  const currentUser = utilizador ?? SEM_UTILIZADOR;
  const hasPerfil = useCallback<DbContextValue["hasPerfil"]>(
    (...perfis) => perfis.includes(currentUser.perfil),
    [currentUser.perfil],
  );

  const value = useMemo<DbContextValue>(
    () => ({
      db: bootstrap.data ?? BASE_VAZIA,
      carregado: Boolean(bootstrap.data),
      currentUser,
      session: utilizador?.id ?? null,
      estado,
      precisaTrocarPassword,
      login,
      logout,
      trocarPassword,
      hasPerfil,
      executar,
      recarregar,
      erro,
      limparErro: () => setErro(null),
    }),
    [bootstrap.data, currentUser, utilizador?.id, estado, precisaTrocarPassword, login, logout, trocarPassword, hasPerfil, executar, recarregar, erro],
  );

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});

export function DbProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DbProviderInterno>{children}</DbProviderInterno>
    </QueryClientProvider>
  );
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error("useDb tem de ser usado dentro de <DbProvider>");
  return ctx;
}
