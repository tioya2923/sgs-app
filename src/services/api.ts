// Cliente da API do SGS. O token de acesso vive só em memória (nunca em
// localStorage); a sessão sobrevive a um refresh da página através do cookie
// httpOnly do refresh token, que o servidor rotaciona a cada renovação.
// VITE_API_URL vazio/ausente em produção = mesma origem (a API serve o frontend); em desenvolvimento, a API local.
const API_URL: string = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3300" : "");
const BASE = `${API_URL.replace(/\/$/, "")}/api/v1`;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, mensagem: string, code = "erro") {
    super(mensagem);
    this.status = status;
    this.code = code;
  }
}

let accessToken: string | null = null;
let aoExpirarSessao: (() => void) | null = null;

export function definirToken(token: string | null) {
  accessToken = token;
}

export function aoSessaoExpirar(cb: (() => void) | null) {
  aoExpirarSessao = cb;
}

export interface UtilizadorApi {
  id: string;
  nome: string;
  perfil: string;
  email: string;
  ativo: boolean;
  ultimoAcesso: string | null;
  mustChangePassword: boolean;
}

/** Renova o token de acesso. Pedidos em simultâneo partilham a mesma renovação (o refresh token é de uso único). */
let renovacaoDados: Promise<{ accessToken: string; utilizador: UtilizadorApi } | null> | null = null;

export function renovarSessao() {
  renovacaoDados ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" });
      if (!res.ok) return null;
      const dados = (await res.json()) as { accessToken: string; utilizador: UtilizadorApi };
      accessToken = dados.accessToken;
      return dados;
    } catch {
      return null;
    } finally {
      setTimeout(() => {
        renovacaoDados = null;
      }, 0);
    }
  })();
  return renovacaoDados;
}

async function pedir<T>(metodo: string, caminho: string, corpo?: unknown, podeRenovar = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      credentials: "include",
      headers: {
        ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ApiError(0, "Sem ligação ao servidor. Verifique a internet e tente de novo.", "rede");
  }

  if (res.status === 401 && podeRenovar && !caminho.startsWith("/auth/")) {
    if (await renovarSessao()) return pedir<T>(metodo, caminho, corpo, false);
    accessToken = null;
    aoExpirarSessao?.();
  }

  if (res.status === 204) return undefined as T;
  const texto = await res.text();
  const json = texto ? safeJson(texto) : null;
  if (!res.ok) {
    const j = json as { mensagem?: string; erro?: string } | null;
    throw new ApiError(res.status, j?.mensagem ?? `Erro ${res.status}`, j?.erro);
  }
  return json as T;
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(caminho: string) => pedir<T>("GET", caminho),
  post: <T>(caminho: string, corpo?: unknown) => pedir<T>("POST", caminho, corpo ?? {}),
  patch: <T>(caminho: string, corpo: unknown) => pedir<T>("PATCH", caminho, corpo),
  put: <T>(caminho: string, corpo: unknown) => pedir<T>("PUT", caminho, corpo),
  delete: <T = void>(caminho: string) => pedir<T>("DELETE", caminho),
};

/** Descarrega um ficheiro (ex.: CSV) com o token de acesso. */
export async function descarregar(caminho: string, nomeFicheiro: string): Promise<void> {
  const pedirBlob = () =>
    fetch(`${BASE}${caminho}`, { credentials: "include", headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  let res = await pedirBlob();
  if (res.status === 401 && (await renovarSessao())) res = await pedirBlob();
  if (!res.ok) throw new ApiError(res.status, "Não foi possível exportar o ficheiro.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFicheiro;
  a.click();
  URL.revokeObjectURL(url);
}

export const auth = {
  async login(email: string, password: string) {
    const dados = await pedir<{ accessToken: string; utilizador: UtilizadorApi }>("POST", "/auth/login", { email, password });
    accessToken = dados.accessToken;
    return dados.utilizador;
  },
  async logout() {
    try {
      await pedir("POST", "/auth/logout", {});
    } finally {
      accessToken = null;
    }
  },
  async trocarPassword(atual: string, nova: string) {
    await pedir("POST", "/auth/change-password", { atual, nova });
  },
};
