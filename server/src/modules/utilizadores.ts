// Administração de utilizadores (só Direção).
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ACESSO } from "../domain/permissoes.js";
import { idParam, perfil, texto } from "../domain/schemas.js";
import { conflito, naoEncontrado } from "../lib/errors.js";
import { registarAcesso } from "../lib/audit.js";
import { politicaPassword } from "./auth/routes.js";

function dto(u: { id: string; nome: string; perfil: string; email: string; ativo: boolean; ultimoAcesso: Date | null }) {
  return { id: u.id, nome: u.nome, perfil: u.perfil, email: u.email, ativo: u.ativo, ultimoAcesso: u.ultimoAcesso?.toISOString() ?? null };
}

export async function utilizadoresRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { prisma } = app;
  const pre = [app.authenticate, app.exigirPerfil(ACESSO.administracao)];

  const direcoesAtivas = (excluir?: string) =>
    prisma.utilizador.count({ where: { perfil: "Direção", ativo: true, ...(excluir ? { id: { not: excluir } } : {}) } });

  r.post(
    "/utilizadores",
    {
      onRequest: pre,
      schema: { body: z.object({ nome: texto(150), email: z.string().trim().toLowerCase().email().max(200), password: politicaPassword, perfil }) },
    },
    async (request, reply) => {
      const { password, ...resto } = request.body;
      const u = await prisma.utilizador.create({
        // A password inicial tem de ser mudada no primeiro acesso.
        data: { ...resto, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), mustChangePassword: true },
      });
      await registarAcesso(prisma, request.auth.nome, "Criou utilizador", u.email);
      return reply.code(201).send(dto(u));
    },
  );

  r.patch(
    "/utilizadores/:id",
    {
      onRequest: pre,
      schema: {
        params: idParam,
        body: z
          .object({ nome: texto(150), email: z.string().trim().toLowerCase().email().max(200), perfil, ativo: z.boolean(), password: politicaPassword })
          .partial(),
      },
    },
    async (request) => {
      const alvo = await prisma.utilizador.findUnique({ where: { id: request.params.id } });
      if (!alvo) throw naoEncontrado();
      const { password, ...campos } = request.body;

      const deixaDeSerDirecaoAtiva =
        alvo.perfil === "Direção" && alvo.ativo && ((campos.perfil && campos.perfil !== "Direção") || campos.ativo === false);
      if (deixaDeSerDirecaoAtiva && (await direcoesAtivas(alvo.id)) === 0) {
        throw conflito("Tem de haver sempre pelo menos uma Direção ativa.");
      }
      if (campos.ativo === false && alvo.id === request.auth.id) throw conflito("Não pode desativar-se a si próprio.");

      const u = await prisma.utilizador.update({
        where: { id: alvo.id },
        data: {
          ...campos,
          ...(password ? { passwordHash: await argon2.hash(password, { type: argon2.argon2id }), mustChangePassword: true } : {}),
        },
      });
      if (password || campos.ativo === false) {
        await prisma.refreshToken.updateMany({ where: { utilizadorId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await registarAcesso(prisma, request.auth.nome, "Editou utilizador", u.email);
      return dto(u);
    },
  );

  r.delete("/utilizadores/:id", { onRequest: pre, schema: { params: idParam } }, async (request, reply) => {
    const alvo = await prisma.utilizador.findUnique({ where: { id: request.params.id } });
    if (!alvo) throw naoEncontrado();
    if (alvo.id === request.auth.id) throw conflito("Não pode remover-se a si próprio.");
    if (alvo.perfil === "Direção" && alvo.ativo && (await direcoesAtivas(alvo.id)) === 0) {
      throw conflito("Tem de haver sempre pelo menos uma Direção ativa.");
    }
    await prisma.utilizador.delete({ where: { id: alvo.id } });
    await registarAcesso(prisma, request.auth.nome, "Removeu utilizador", alvo.email);
    return reply.code(204).send();
  });
}
