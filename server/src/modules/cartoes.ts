// Cartões Pingo Doce: emissão, confirmação de entrega e cancelamento.
import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ACESSO } from "../domain/permissoes.js";
import { data, idParam, texto, uuid } from "../domain/schemas.js";
import { diasAte, hojeISO } from "../lib/datas.js";
import { conflito, naoEncontrado } from "../lib/errors.js";
import { registarAcesso } from "../lib/audit.js";
import { serialize } from "../lib/serialize.js";

export async function cartoesRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { prisma } = app;
  const pre = [app.authenticate, app.exigirPerfil(ACESSO.cartoes)];

  r.post(
    "/cartoes",
    {
      onRequest: pre,
      schema: {
        body: z.object({
          processoId: uuid,
          numero: texto(40).optional(),
          valor: z.number().positive().max(100_000),
          origemFundo: texto(150),
          validade: data,
        }),
      },
    },
    async (request, reply) => {
      const b = request.body;
      const cartao = await prisma.$transaction(async (tx) => {
        const processo = await tx.processo.findUnique({ where: { id: b.processoId }, include: { pessoa: true } });
        if (!processo) throw naoEncontrado("Processo não encontrado");
        if (b.validade < hojeISO()) throw conflito("A validade do cartão não pode estar no passado.");

        let numero = b.numero;
        if (numero) {
          if (await tx.cartao.findUnique({ where: { numero } })) throw conflito(`Já existe um cartão com o número ${numero}.`);
        } else {
          do {
            numero = `PD-${randomInt(100000, 1000000)}`;
          } while (await tx.cartao.findUnique({ where: { numero } }));
        }
        return tx.cartao.create({
          data: {
            numero,
            agregadoId: processo.pessoa.agregadoId,
            processoId: processo.id,
            valor: b.valor,
            origemFundo: b.origemFundo,
            carregadoEm: hojeISO(),
            validade: b.validade,
            provaRececao: false,
            emitidoPor: request.auth.nome,
            estado: "Por entregar",
          },
        });
      });
      await registarAcesso(prisma, request.auth.nome, "Atribuiu cartão", cartao.numero);
      return reply.code(201).send(serialize(cartao));
    },
  );

  r.post(
    "/cartoes/:id/entrega",
    { onRequest: pre, schema: { params: idParam, body: z.object({ entregueEm: data, recebidoPor: texto(150) }) } },
    async (request) => {
      const cartao = await prisma.cartao.findUnique({ where: { id: request.params.id } });
      if (!cartao) throw naoEncontrado();
      if (cartao.estado !== "Por entregar") throw conflito("Só um cartão por entregar pode ser entregue.");
      if (diasAte(cartao.validade) < 0) {
        throw conflito("A validade já passou sem o cartão ter sido entregue — cancele e emita um novo.");
      }
      const atualizado = await prisma.cartao.update({
        where: { id: cartao.id },
        data: { estado: "Ativo", provaRececao: true, entregueEm: request.body.entregueEm, recebidoPor: request.body.recebidoPor },
      });
      await registarAcesso(prisma, request.auth.nome, "Confirmou entrega de cartão", cartao.numero);
      return serialize(atualizado);
    },
  );

  r.post("/cartoes/:id/cancelar", { onRequest: pre, schema: { params: idParam } }, async (request) => {
    const cartao = await prisma.cartao.findUnique({ where: { id: request.params.id } });
    if (!cartao) throw naoEncontrado();
    if (cartao.estado !== "Ativo" && cartao.estado !== "Por entregar") throw conflito("Este cartão já não pode ser cancelado.");
    const atualizado = await prisma.cartao.update({ where: { id: cartao.id }, data: { estado: "Cancelado" } });
    await registarAcesso(prisma, request.auth.nome, "Cancelou cartão", cartao.numero);
    return serialize(atualizado);
  });
}
