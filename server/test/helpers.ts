import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createPrisma, type PrismaClient } from "../src/db.js";
import { seed } from "../prisma/seed.js";

export const PASSWORD = "Demo-Sgs-2026!";

export interface Ctx {
  app: FastifyInstance;
  prisma: PrismaClient;
  /** Faz login e devolve cabeçalhos autenticados. */
  login: (email: string, password?: string) => Promise<{ Authorization: string }>;
  fechar: () => Promise<void>;
}

export const EMAILS = {
  direcao: "direcao@cssaonicolau.pt",
  tecnico: "marta.ribeiro@cssaonicolau.pt",
  voluntario: "helena.sousa@voluntarios.pt",
  cozinha: "cozinha@cssaonicolau.pt",
  armazem: "armazem@cssaonicolau.pt",
  admin: "secretaria@cssaonicolau.pt",
} as const;

export async function criarContexto(opts: { reseed?: boolean } = {}): Promise<Ctx> {
  const config = loadConfig({ ...process.env, LOGIN_MAX_FAILS: "3", LOGIN_RATE_MAX: "1000" });
  if (opts.reseed !== false) await seed(config.DATABASE_URL, PASSWORD, false);
  const prisma = createPrisma(config.DATABASE_URL);
  const app = await buildApp(config, prisma);
  await app.ready();
  return {
    app,
    prisma,
    async login(email, password = PASSWORD) {
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password } });
      if (res.statusCode !== 200) throw new Error(`login falhou (${res.statusCode}): ${res.body}`);
      return { Authorization: `Bearer ${res.json().accessToken}` };
    },
    async fechar() {
      await app.close();
      await prisma.$disconnect();
    },
  };
}
