import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { Config } from "./config.js";
import { Prisma, type PrismaClient } from "./db.js";
import { AppError } from "./lib/errors.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { bootstrapRoutes } from "./modules/bootstrap.js";
import { alertasRoutes } from "./modules/alertas.js";
import { cartoesRoutes } from "./modules/cartoes.js";
import { casosRoutes } from "./modules/casos.js";
import { mensagensRoutes } from "./modules/mensagens.js";
import { relatoriosRoutes } from "./modules/relatorios.js";
import { utilizadoresRoutes } from "./modules/utilizadores.js";
import { distribuicaoRoutes } from "./modules/distribuicao.js";
import { existenciasRoutes } from "./modules/existencias.js";

// Mensagens de validação em português (as que escrevemos à mão já o estão).
z.config(z.locales.pt());

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: Config;
  }
}

export async function buildApp(config: Config, prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === "test"
        ? false
        : {
            level: config.NODE_ENV === "production" ? "info" : "debug",
            redact: ["req.headers.authorization", "req.headers.cookie"],
            ...(config.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : {}),
          },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("prisma", prisma);
  app.decorate("config", config);

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: true,
      // Em http (desenvolvimento) o navegador não deve forçar https nos pedidos da própria página.
      directives: config.NODE_ENV === "production" ? {} : { "upgrade-insecure-requests": null },
    },
  });
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, ctx) =>
      Object.assign(new Error(`Demasiados pedidos. Tente de novo dentro de ${Math.ceil(ctx.ttl / 1000)} segundos.`), { statusCode: 429 }),
  });
  await app.register(authPlugin);

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const detalhes = error.validation.map((v) => ({ campo: v.instancePath.replace(/^\//, "").replace(/\//g, "."), mensagem: v.message }));
      const resumo = detalhes.slice(0, 3).map((d) => (d.campo ? `${d.campo}: ${d.mensagem}` : d.mensagem)).join("; ");
      return reply.code(400).send({ erro: "validacao", mensagem: `Dados inválidos — ${resumo}`, detalhes });
    }
    if (error instanceof AppError) {
      return reply.code(error.status).send({ erro: error.code, mensagem: error.message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return reply.code(409).send({ erro: "conflito", mensagem: "Já existe um registo com estes dados." });
      if (error.code === "P2025") return reply.code(404).send({ erro: "nao_encontrado", mensagem: "Registo não encontrado." });
      if (error.code === "P2003") return reply.code(409).send({ erro: "conflito", mensagem: "Operação bloqueada por registos relacionados." });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ erro: "pedido_invalido", mensagem: (error as Error).message });
    }
    request.log.error(error);
    return reply.code(500).send({ erro: "interno", mensagem: "Erro interno do servidor." });
  });

  app.get("/health", { config: { rateLimit: false } }, async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { estado: "ok" };
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: "/auth" });
      await api.register(bootstrapRoutes);
      await api.register(casosRoutes);
      await api.register(existenciasRoutes);
      await api.register(distribuicaoRoutes);
      await api.register(cartoesRoutes);
      await api.register(mensagensRoutes);
      await api.register(utilizadoresRoutes);
      await api.register(alertasRoutes);
      await api.register(relatoriosRoutes);
    },
    { prefix: "/api/v1" },
  );

  if (config.FRONTEND_DIR) {
    const raiz = resolve(config.FRONTEND_DIR);
    if (!existsSync(resolve(raiz, "index.html"))) throw new Error(`FRONTEND_DIR não tem index.html: ${raiz}`);
    await app.register(fastifyStatic, {
      root: raiz,
      wildcard: false,
      // Ficheiros com hash no nome nunca mudam; o resto (index, sw.js, manifest) revalida sempre.
      setHeaders: (res, caminho) => {
        const imutavel = /[\\/]assets[\\/]/.test(caminho);
        res.header("Cache-Control", imutavel ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
    // Rotas do frontend (React Router) devolvem o index.html; a API e ficheiros em falta dão 404 em JSON.
    app.setNotFoundHandler((request, reply) => {
      const pedeHtml = request.headers.accept?.includes("text/html");
      if (request.method === "GET" && !request.url.startsWith("/api/") && pedeHtml) return reply.sendFile("index.html");
      return reply.code(404).send({ erro: "nao_encontrado", mensagem: "Não encontrado." });
    });
  }

  return app;
}
