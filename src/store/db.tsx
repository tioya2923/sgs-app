import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Database, Perfil, Utilizador } from "../types";
import { buildSeed } from "../data/seed";

const STORAGE_KEY = "sgs-sao-nicolau:db:v1";
const SESSION_KEY = "sgs-sao-nicolau:sessao";

function loadDb(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Database;
      // Migração: instalações anteriores a este ecrã de login não tinham palavra-passe.
      // Sem isto, ninguém conseguiria voltar a entrar depois de já ter usado o sistema.
      if (parsed.utilizadores?.some((u) => !u.password)) {
        const fresh = buildSeed();
        parsed.utilizadores = parsed.utilizadores.map((u) => {
          if (u.password) return u;
          const correspondente = fresh.utilizadores.find((f) => f.email === u.email);
          return { ...u, password: correspondente?.password ?? "muda-me" };
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
      return parsed;
    }
  } catch {
    // localStorage corrompido ou indisponível — recomeça com dados de exemplo
  }
  const seeded = buildSeed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

type WithId = { id: string };

interface DbContextValue {
  db: Database;
  addRecord: <K extends keyof Database>(key: K, record: Database[K][number] & WithId) => void;
  updateRecord: <K extends keyof Database>(
    key: K,
    recordId: string,
    patch: Partial<Database[K][number]>
  ) => void;
  removeRecord: <K extends keyof Database>(key: K, recordId: string) => void;
  resetDb: () => void;
  currentUser: Utilizador;
  session: string | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  hasPerfil: (...perfis: Perfil[]) => boolean;
}

const DbContext = createContext<DbContextValue | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(loadDb);
  const [session, setSession] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }, [db]);

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, session);
    else localStorage.removeItem(SESSION_KEY);
  }, [session]);

  const currentUser = useMemo<Utilizador>(() => {
    return db.utilizadores.find((u) => u.id === session) ?? db.utilizadores[0];
  }, [db.utilizadores, session]);

  const addRecord = useCallback<DbContextValue["addRecord"]>((key, record) => {
    setDb((prev) => ({
      ...prev,
      [key]: [...(prev[key] as WithId[]), record],
    }));
  }, []);

  const updateRecord = useCallback<DbContextValue["updateRecord"]>((key, recordId, patch) => {
    setDb((prev) => ({
      ...prev,
      [key]: (prev[key] as WithId[]).map((item) =>
        item.id === recordId ? { ...item, ...patch } : item
      ),
    }));
  }, []);

  const removeRecord = useCallback<DbContextValue["removeRecord"]>((key, recordId) => {
    setDb((prev) => ({
      ...prev,
      [key]: (prev[key] as WithId[]).filter((item) => item.id !== recordId),
    }));
  }, []);

  const resetDb = useCallback(() => {
    const seeded = buildSeed();
    setDb(seeded);
  }, []);

  const login = useCallback<DbContextValue["login"]>(
    (email, password) => {
      const emailNormalizado = email.trim().toLowerCase();
      const encontrado = db.utilizadores.find(
        (u) => u.ativo && u.email.toLowerCase() === emailNormalizado && u.password === password
      );
      if (!encontrado) return false;
      setSession(encontrado.id);
      updateRecord("utilizadores", encontrado.id, {
        ultimoAcesso: new Date().toISOString().slice(0, 10),
      });
      return true;
    },
    [db.utilizadores, updateRecord]
  );

  const logout = useCallback(() => setSession(null), []);

  const hasPerfil = useCallback<DbContextValue["hasPerfil"]>(
    (...perfis) => perfis.includes(currentUser.perfil),
    [currentUser.perfil]
  );

  const value: DbContextValue = {
    db,
    addRecord,
    updateRecord,
    removeRecord,
    resetDb,
    currentUser,
    session,
    login,
    logout,
    hasPerfil,
  };

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error("useDb tem de ser usado dentro de <DbProvider>");
  return ctx;
}
