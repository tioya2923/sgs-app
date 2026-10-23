// Existências: entradas, saídas e transferências entre armazéns. Todas as
// operações que mexem em stock são atómicas — lote(s), artigo e movimento mudam
// juntos ou não mudam.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { TRANSFERE_ARMAZEM, podeEditarArmazem } from "../domain/permissoes.js";
import { data, quantidade, texto, textoOpc, uuid } from "../domain/schemas.js";
import type { ArmazemCodigo } from "../domain/types.js";
import { hojeISO } from "../lib/datas.js";
import { conflito, invalido, naoEncontrado, proibido } from "../lib/errors.js";
import { serialize } from "../lib/serialize.js";
import { consumirStock, type Tx } from "../services/stock.js";

const LOCALIZACAO_PADRAO: Record<ArmazemCodigo, string> = {
  BSA: "Prateleira A",
  RES: "Arca / prateleira",
  CDC: "Copa",
  BSR: "Arrecadação",
};

const artigoNovo = z.object({
  nome: texto(150),
  categoria: texto(100),
  unidade: texto(20).default("un"),
  stockMinimo: z.number().int().min(0).max(1_000_000).default(5),
  consumivel: z.boolean().default(true),
});

/** Devolve o artigo com este nome no armazém (sem distinguir maiúsculas/espaços) ou cria-o. */
export async function artigoPorNomeOuCriar(tx: Tx, armazemId: string, novo: z.infer<typeof artigoNovo>) {
  const nome = novo.nome.trim();
  const existentes = await tx.artigo.findMany({ where: { armazemId } });
  const igual = existentes.find((a) => a.nome.trim().toLowerCase() === nome.toLowerCase());
  if (igual) return { artigo: igual, criado: false };
  return { artigo: await tx.artigo.create({ data: { ...novo, nome, armazemId } }), criado: true };
}

export async function existenciasRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { prisma } = app;

  // ----------------------------------------------------------------- entradas
  r.post(
    "/existencias/entradas",
    {
      onRequest: app.authenticate,
      schema: {
        body: z
          .object({
            armazemId: uuid,
            artigoId: uuid.optional(),
            novoArtigo: artigoNovo.optional(),
            quantidade,
            validade: data.nullable().optional(),
            fornecedor: textoOpc(200).nullable().optional(),
            benfeitor: textoOpc(200).nullable().optional(),
            documento: textoOpc(100).nullable().optional(),
            localizacaoFisica: textoOpc(100).optional(),
          })
          .refine((b) => Boolean(b.artigoId) !== Boolean(b.novoArtigo), "Indique um artigo existente ou um artigo novo"),
      },
    },
    async (request, reply) => {
      const b = request.body;
      const armazem = await prisma.armazem.findUnique({ where: { id: b.armazemId } });
      if (!armazem) throw naoEncontrado("Armazém não encontrado");
      if (!podeEditarArmazem(request.auth.perfil, armazem.codigo as ArmazemCodigo)) throw proibido();

      const resultado = await prisma.$transaction(async (tx) => {
        let artigo;
        if (b.novoArtigo) {
          artigo = (await artigoPorNomeOuCriar(tx, armazem.id, b.novoArtigo)).artigo;
        } else {
          artigo = await tx.artigo.findUnique({ where: { id: b.artigoId! } });
          if (!artigo || artigo.armazemId !== armazem.id) throw invalido("O artigo não pertence a este armazém");
        }
        const hoje = hojeISO();
        const lote = await tx.lote.create({
          data: {
            artigoId: artigo.id,
            quantidade: b.quantidade,
            validade: b.validade ?? null,
            localizacaoFisica: b.localizacaoFisica || LOCALIZACAO_PADRAO[armazem.codigo as ArmazemCodigo],
            estado: "disponível",
            entrada: hoje,
          },
        });
        const movimento = await tx.movimento.create({
          data: {
            artigoId: artigo.id,
            loteId: lote.id,
            tipo: "entrada",
            quantidade: b.quantidade,
            data: hoje,
            origemOuDestino: armazem.designacao,
            fornecedor: b.fornecedor || null,
            benfeitor: b.benfeitor || null,
            documento: b.documento || null,
            registadoPor: request.auth.nome,
          },
        });
        return { artigo, lote, movimento };
      });
      return reply.code(201).send(serialize(resultado));
    },
  );

  // ------------------------------------------------------------------- saídas
  r.post(
    "/existencias/saidas",
    {
      onRequest: app.authenticate,
      schema: {
        body: z.object({
          artigoId: uuid,
          quantidade,
          destino: texto(200),
          referencia: textoOpc(100).nullable().optional(),
        }),
      },
    },
    async (request, reply) => {
      const b = request.body;
      const artigo = await prisma.artigo.findUnique({ where: { id: b.artigoId }, include: { armazem: true } });
      if (!artigo) throw naoEncontrado("Artigo não encontrado");
      if (!podeEditarArmazem(request.auth.perfil, artigo.armazem.codigo as ArmazemCodigo)) throw proibido();

      const movimentos = await prisma.$transaction(async (tx) => {
        const consumos = await consumirStock(tx, artigo.id, b.quantidade, "validade", artigo.nome);
        const hoje = hojeISO();
        const criados = [];
        for (const c of consumos) {
          criados.push(
            await tx.movimento.create({
              data: {
                artigoId: artigo.id,
                loteId: c.loteId,
                tipo: "saída",
                quantidade: c.retirado,
                data: hoje,
                origemOuDestino: b.destino,
                registadoPor: request.auth.nome,
                referencia: b.referencia ?? null,
              },
            }),
          );
        }
        return criados;
      });
      return reply.code(201).send(serialize({ movimentos }));
    },
  );

  // ------------------------------------------------------------ transferências
  r.post(
    "/existencias/transferencias",
    {
      onRequest: [app.authenticate, app.exigirPerfil(TRANSFERE_ARMAZEM)],
      schema: { body: z.object({ artigoId: uuid, armazemDestinoId: uuid, quantidade }) },
    },
    async (request, reply) => {
      const b = request.body;
      const artigo = await prisma.artigo.findUnique({ where: { id: b.artigoId }, include: { armazem: true } });
      if (!artigo) throw naoEncontrado("Artigo não encontrado");
      const destino = await prisma.armazem.findUnique({ where: { id: b.armazemDestinoId } });
      if (!destino) throw naoEncontrado("Armazém de destino não encontrado");
      if (destino.id === artigo.armazemId) throw conflito("O armazém de destino tem de ser diferente do de origem.");

      const resultado = await prisma.$transaction(async (tx) => {
        const consumos = await consumirStock(tx, artigo.id, b.quantidade, "validade", artigo.nome);
        const { artigo: artigoDestino } = await artigoPorNomeOuCriar(tx, destino.id, {
          nome: artigo.nome,
          categoria: artigo.categoria,
          unidade: artigo.unidade,
          stockMinimo: artigo.stockMinimo,
          consumivel: artigo.consumivel,
        });
        const hoje = hojeISO();
        const lotesOrigem = await tx.lote.findMany({ where: { id: { in: consumos.map((c) => c.loteId) } } });
        // Cada porção mantém a validade do lote de onde saiu (os alertas de validade continuam certos).
        for (const c of consumos) {
          const origem = lotesOrigem.find((l) => l.id === c.loteId)!;
          await tx.lote.create({
            data: {
              artigoId: artigoDestino.id,
              quantidade: c.retirado,
              validade: origem.validade,
              localizacaoFisica: "Transferido",
              estado: "disponível",
              entrada: hoje,
            },
          });
        }
        const movimento = await tx.movimento.create({
          data: {
            artigoId: artigo.id,
            loteId: null,
            tipo: "transferência",
            quantidade: b.quantidade,
            data: hoje,
            origemOuDestino: `${artigo.armazem.designacao} → ${destino.designacao}`,
            registadoPor: request.auth.nome,
          },
        });
        return { artigoDestino, movimento };
      });
      return reply.code(201).send(serialize(resultado));
    },
  );
}
