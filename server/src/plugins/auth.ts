import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Perfil } from "../domain/types.js";
import { AppError, proibido } from "../lib/errors.js";

export interface AuthUser {
  id: string;
  nome: string;
  perfil: Perfil;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler que exige um dos perfis indicados (a Direção deve vir já incluída na lista). */
    exigirPerfil: (perfis: readonly Perfil[]) => (request: FastifyRequest) => Promise<void>;
  }
}

export const authPlugin = fp(async (app) => {
  // O token só prova quem é; o perfil e o estado "ativo" vêm sempre da base de
  // dados, para que desativar ou despromover uma conta tenha efeito imediato.
  app.decorate("authenticate", async (request: FastifyRequest) => {
    let sub: string;
    try {
      const payload = await request.jwtVerify<{ sub: string }>();
      sub = payload.sub;
    } catch {
      throw new AppError(401, "Sessão inválida ou expirada", "nao_autenticado");
    }
    const utilizador = await app.prisma.utilizador.findUnique({
      where: { id: sub },
      select: { id: true, nome: true, perfil: true, ativo: true },
    });
    if (!utilizador?.ativo) throw new AppError(401, "Conta inexistente ou desativada", "nao_autenticado");
    request.auth = { id: utilizador.id, nome: utilizador.nome, perfil: utilizador.perfil as Perfil };
  });

  app.decorate("exigirPerfil", (perfis: readonly Perfil[]) => async (request: FastifyRequest) => {
    if (!perfis.includes(request.auth.perfil)) throw proibido();
  });
});
