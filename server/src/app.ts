import Fastify, { type FastifyInstance } from "fastify";
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

  await app.register(helmet);
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
  await app.register(authPlugin);

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        erro: "validacao",
        mensagem: "Dados inválidos",
        detalhes: error.validation.map((v) => ({ campo: v.instancePath, mensagem: v.message })),
      });
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
    },
    { prefix: "/api/v1" },
  );

  return app;
}
