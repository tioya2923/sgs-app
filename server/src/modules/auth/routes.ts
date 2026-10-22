import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError, invalido } from "../../lib/errors.js";
import { registarAcesso } from "../../lib/audit.js";

export const COOKIE_REFRESH = "sgs_refresh";
const MIN_PASSWORD = 10;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Hash falso para gastar o mesmo tempo quando o e-mail não existe (evita
// distinguir "conta inexistente" de "password errada" pelo tempo de resposta).
const HASH_FALSO = await argon2.hash("nao-e-uma-password-real", { type: argon2.argon2id });

export const politicaPassword = z
  .string()
  .min(MIN_PASSWORD, `A palavra-passe precisa de pelo menos ${MIN_PASSWORD} caracteres`)
  .max(200);

function dtoUtilizador(u: {
  id: string;
  nome: string;
  perfil: string;
  email: string;
  ativo: boolean;
  ultimoAcesso: Date | null;
  mustChangePassword: boolean;
}) {
  return {
    id: u.id,
    nome: u.nome,
    perfil: u.perfil,
    email: u.email,
    ativo: u.ativo,
    ultimoAcesso: u.ultimoAcesso?.toISOString() ?? null,
    mustChangePassword: u.mustChangePassword,
  };
}

export async function authRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { config, prisma } = app;

  function assinarAcesso(userId: string): string {
    return app.jwt.sign({ sub: userId }, { expiresIn: `${config.ACCESS_TOKEN_MINUTES}m` });
  }

  async function emitirRefresh(userId: string, reply: FastifyReply): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({ data: { utilizadorId: userId, tokenHash: hashToken(token), expiresAt } });
    reply.setCookie(COOKIE_REFRESH, token, {
      httpOnly: true,
      secure: config.NODE_ENV === "production" || config.COOKIE_SAMESITE === "none",
      sameSite: config.COOKIE_SAMESITE,
      path: "/api/v1/auth",
      expires: expiresAt,
    });
  }

  // ------------------------------------------------------------------ login
  r.post(
    "/login",
    {
      config: { rateLimit: { max: config.LOGIN_RATE_MAX, timeWindow: "1 minute" } },
      schema: { body: z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }) },
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      const u = await prisma.utilizador.findUnique({ where: { email } });

      if (u?.lockedUntil && u.lockedUntil > new Date()) {
        await argon2.verify(HASH_FALSO, request.body.password).catch(() => false);
        throw new AppError(429, "Conta temporariamente bloqueada por demasiadas tentativas. Tente mais tarde.", "bloqueada");
      }

      const hash = u?.passwordHash ?? HASH_FALSO;
      const ok = await argon2.verify(hash, request.body.password).catch(() => false);

      if (!u || !ok || !u.ativo) {
        if (u) {
          const falhas = u.failedLogins + 1;
          const bloquear = falhas >= config.LOGIN_MAX_FAILS;
          await prisma.utilizador.update({
            where: { id: u.id },
            data: {
              failedLogins: bloquear ? 0 : falhas,
              lockedUntil: bloquear ? new Date(Date.now() + config.LOGIN_LOCK_MINUTES * 60_000) : null,
            },
          });
          await registarAcesso(prisma, u.nome, bloquear ? "Conta bloqueada (tentativas falhadas)" : "Login falhado", u.email);
        }
        throw new AppError(401, "Email ou palavra-passe incorretos.", "credenciais");
      }

      const atualizado = await prisma.utilizador.update({
        where: { id: u.id },
        data: { failedLogins: 0, lockedUntil: null, ultimoAcesso: new Date() },
      });
      await registarAcesso(prisma, u.nome, "Login", u.email);
      await emitirRefresh(u.id, reply);
      return { accessToken: assinarAcesso(u.id), utilizador: dtoUtilizador(atualizado) };
    },
  );

  // ---------------------------------------------------------------- refresh
  r.post("/refresh", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const token = request.cookies[COOKIE_REFRESH];
    if (!token) throw new AppError(401, "Sem sessão", "nao_autenticado");

    const registo = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { utilizador: true },
    });
    if (!registo) throw new AppError(401, "Sessão inválida", "nao_autenticado");

    // Um token já usado a voltar a aparecer indica roubo: fecham-se todas as sessões da conta.
    if (registo.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { utilizadorId: registo.utilizadorId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      reply.clearCookie(COOKIE_REFRESH, { path: "/api/v1/auth" });
      throw new AppError(401, "Sessão inválida", "nao_autenticado");
    }
    if (registo.expiresAt < new Date() || !registo.utilizador.ativo) {
      reply.clearCookie(COOKIE_REFRESH, { path: "/api/v1/auth" });
      throw new AppError(401, "Sessão expirada", "nao_autenticado");
    }

    await prisma.refreshToken.update({ where: { id: registo.id }, data: { revokedAt: new Date() } });
    await emitirRefresh(registo.utilizadorId, reply);
    return { accessToken: assinarAcesso(registo.utilizadorId), utilizador: dtoUtilizador(registo.utilizador) };
  });

  // ----------------------------------------------------------------- logout
  r.post("/logout", async (request, reply) => {
    const token = request.cookies[COOKIE_REFRESH];
    if (token) {
      const registo = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { utilizador: { select: { nome: true, email: true } } },
      });
      if (registo && !registo.revokedAt) {
        await prisma.refreshToken.update({ where: { id: registo.id }, data: { revokedAt: new Date() } });
        await registarAcesso(prisma, registo.utilizador.nome, "Logout", registo.utilizador.email);
      }
    }
    reply.clearCookie(COOKIE_REFRESH, { path: "/api/v1/auth" });
    return reply.code(204).send();
  });

  // --------------------------------------------------------------------- me
  r.get("/me", { preHandler: app.authenticate }, async (request) => {
    const u = await prisma.utilizador.findUniqueOrThrow({ where: { id: request.auth.id } });
    return { utilizador: dtoUtilizador(u) };
  });

  // -------------------------------------------------------- mudar password
  r.post(
    "/change-password",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: config.LOGIN_RATE_MAX, timeWindow: "1 minute" } },
      schema: { body: z.object({ atual: z.string().min(1).max(200), nova: politicaPassword }) },
    },
    async (request, reply) => {
      const u = await prisma.utilizador.findUniqueOrThrow({ where: { id: request.auth.id } });
      if (!(await argon2.verify(u.passwordHash, request.body.atual).catch(() => false))) {
        throw new AppError(400, "A palavra-passe atual está incorreta.", "credenciais");
      }
      if (request.body.nova === request.body.atual) throw invalido("A nova palavra-passe tem de ser diferente da atual.");

      await prisma.utilizador.update({
        where: { id: u.id },
        data: { passwordHash: await argon2.hash(request.body.nova, { type: argon2.argon2id }), mustChangePassword: false },
      });
      // Todas as sessões antigas caem; esta recebe uma nova.
      await prisma.refreshToken.updateMany({ where: { utilizadorId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await emitirRefresh(u.id, reply);
      await registarAcesso(prisma, u.nome, "Alterou a palavra-passe", u.email);
      return reply.code(204).send();
    },
  );
}
