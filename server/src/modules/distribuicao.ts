// Distribuição: cabazes, modelos de cabaz, entregas de roupa e refeições.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ACESSO } from "../domain/permissoes.js";
import { ESTADOS_ROUPA, TURNOS, data, idParam, quantidade, texto, uuid } from "../domain/schemas.js";
import { hojeISO } from "../lib/datas.js";
import { conflito, invalido, naoEncontrado } from "../lib/errors.js";
import { serialize } from "../lib/serialize.js";
import { consumirStock } from "../services/stock.js";

const linhaCabaz = z.object({ artigoId: uuid, quantidade: z.number().int().min(0).max(10_000) });

function semDuplicados(linhas: { artigoId: string }[]): boolean {
  return new Set(linhas.map((l) => l.artigoId)).size === linhas.length;
}

const naoNegativo = z.number().int().min(0).max(100_000);

export async function distribuicaoRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { prisma } = app;

  // ------------------------------------------------------------ entrega de cabaz
  r.post(
    "/cabazes/entregas",
    {
      onRequest: [app.authenticate, app.exigirPerfil(ACESSO.cabazes)],
      schema: {
        body: z.object({
          agregadoId: uuid,
          modeloId: uuid,
          linhas: z.array(linhaCabaz).min(1).max(100).refine(semDuplicados, "Artigo repetido no cabaz"),
        }),
      },
    },
    async (request, reply) => {
      const b = request.body;
      const entrega = await prisma.$transaction(async (tx) => {
        const agregado = await tx.agregado.findUnique({ where: { id: b.agregadoId } });
        if (!agregado) throw naoEncontrado("Agregado não encontrado");
        const modelo = await tx.modeloCabaz.findUnique({ where: { id: b.modeloId } });
        if (!modelo?.ativo) throw invalido("Modelo de cabaz inexistente ou inativo");

        const pessoas = await tx.pessoa.findMany({ where: { agregadoId: agregado.id }, orderBy: { nome: "asc" } });
        const processos = await tx.processo.findMany({ where: { pessoaId: { in: pessoas.map((p) => p.id) } }, orderBy: { numero: "asc" } });
        const processo = processos.find((p) => p.estado === "Ativo") ?? processos[0];
        if (!processo) throw conflito("Este agregado não tem processo associado — não é possível confirmar a entrega.");

        const armazem = await tx.armazem.findUniqueOrThrow({ where: { codigo: "BSA" } });
        const artigos = await tx.artigo.findMany({ where: { id: { in: b.linhas.map((l) => l.artigoId) } } });
        for (const l of b.linhas) {
          const a = artigos.find((x) => x.id === l.artigoId);
          if (!a || a.armazemId !== armazem.id) throw invalido("Artigo do cabaz não pertence ao Banco Solidário de Alimentos");
        }

        const hoje = hojeISO();
        for (const l of b.linhas) {
          if (l.quantidade === 0) continue;
          const artigo = artigos.find((x) => x.id === l.artigoId)!;
          const consumos = await consumirStock(tx, artigo.id, l.quantidade, "validade", artigo.nome);
          for (const c of consumos) {
            await tx.movimento.create({
              data: {
                artigoId: artigo.id,
                loteId: c.loteId,
                tipo: "saída",
                quantidade: c.retirado,
                data: hoje,
                origemOuDestino: `Cabaz — Agregado ${agregado.codigo}`,
                registadoPor: request.auth.nome,
                referencia: agregado.codigo,
              },
            });
          }
        }

        return tx.entregaCabaz.create({
          data: {
            agregadoId: agregado.id,
            processoId: processo.id,
            tipo: "Semanal",
            modeloId: modelo.id,
            modeloVersao: modelo.versao,
            dataPrevista: hoje,
            dataEfetiva: hoje,
            levantadoPor: (pessoas.find((p) => p.parentesco === "Titular") ?? pessoas[0])?.nome ?? null,
            registadoPor: request.auth.nome,
            estado: "Entregue",
            observacoes: "",
            linhas: b.linhas,
          },
        });
      });
      return reply.code(201).send(serialize(entrega));
    },
  );

  // ------------------------------------------------------------ modelos de cabaz
  r.patch(
    "/modelos-cabaz/:id",
    {
      onRequest: [app.authenticate, app.exigirPerfil(ACESSO.modelosCabaz)],
      schema: {
        params: idParam,
        body: z.object({ linhas: z.array(linhaCabaz).min(1).max(100).refine(semDuplicados, "Artigo repetido no modelo") }),
      },
    },
    async (request) => {
      const modelo = await prisma.$transaction(async (tx) => {
        const atual = await tx.modeloCabaz.findUnique({ where: { id: request.params.id } });
        if (!atual) throw naoEncontrado();
        const n = await tx.artigo.count({ where: { id: { in: request.body.linhas.map((l) => l.artigoId) } } });
        if (n !== request.body.linhas.length) throw invalido("Há artigos inexistentes no modelo");
        // Cada gravação cria uma nova versão; as entregas antigas continuam a apontar para a versão em que foram feitas.
        return tx.modeloCabaz.update({ where: { id: atual.id }, data: { linhas: request.body.linhas, versao: atual.versao + 1 } });
      });
      return serialize(modelo);
    },
  );

  // ----------------------------------------------------------- entrega de roupa
  r.post(
    "/roupa/entregas",
    {
      onRequest: [app.authenticate, app.exigirPerfil(ACESSO.roupaEntregas)],
      schema: {
        body: z.object({
          processoId: uuid,
          itens: z
            .array(z.object({ tipo: texto(150), tamanho: texto(20), quantidade, estado: z.enum(ESTADOS_ROUPA) }))
            .min(1)
            .max(50),
        }),
      },
    },
    async (request, reply) => {
      const b = request.body;
      const entrega = await prisma.$transaction(async (tx) => {
        const processo = await tx.processo.findUnique({ where: { id: b.processoId } });
        if (!processo) throw naoEncontrado("Processo não encontrado");
        const armazem = await tx.armazem.findUniqueOrThrow({ where: { codigo: "BSR" } });
        const artigos = await tx.artigo.findMany({ where: { armazemId: armazem.id } });

        // Várias linhas podem pedir o mesmo artigo (tamanhos diferentes): somam-se antes de descontar.
        const porNome = new Map<string, number>();
        for (const it of b.itens) {
          if (!artigos.some((a) => a.nome === it.tipo)) throw invalido(`Artigo "${it.tipo}" não existe no Banco Solidário de Roupa`);
          porNome.set(it.tipo, (porNome.get(it.tipo) ?? 0) + it.quantidade);
        }

        const hoje = hojeISO();
        for (const [nome, total] of porNome) {
          const artigo = artigos.find((a) => a.nome === nome)!;
          const consumos = await consumirStock(tx, artigo.id, total, "entrada", artigo.nome);
          for (const c of consumos) {
            await tx.movimento.create({
              data: {
                artigoId: artigo.id,
                loteId: c.loteId,
                tipo: "saída",
                quantidade: c.retirado,
                data: hoje,
                origemOuDestino: `Entrega de roupa — processo nº ${processo.numero}`,
                registadoPor: request.auth.nome,
                referencia: String(processo.numero),
              },
            });
          }
        }
        return tx.entregaRoupa.create({
          data: { processoId: processo.id, data: hoje, artigos: b.itens, registadoPor: request.auth.nome },
        });
      });
      return reply.code(201).send(serialize(entrega));
    },
  );

  // ------------------------------------------------------------------ refeições
  r.post(
    "/refeicoes/contagens",
    {
      onRequest: [app.authenticate, app.exigirPerfil(ACESSO.refeicoes)],
      schema: {
        body: z.object({
          turno: z.enum(TURNOS),
          numPessoas: naoNegativo,
          sopas: naoNegativo,
          pratos: naoNegativo,
          sobremesas: naoNegativo,
          pao: naoNegativo,
          aguas: naoNegativo,
        }),
      },
    },
    async (request, reply) => {
      const hoje = hojeISO();
      // Uma contagem por dia e turno: repetir duplicava os números em vez de os corrigir.
      if (await prisma.refeicaoContagem.findUnique({ where: { data_turno: { data: hoje, turno: request.body.turno } } })) {
        throw conflito(`Já existe uma contagem para o ${request.body.turno.toLowerCase()} de hoje.`);
      }
      const c = await prisma.refeicaoContagem.create({ data: { ...request.body, data: hoje } });
      return reply.code(201).send(serialize(c));
    },
  );

  r.post(
    "/refeicoes/presencas",
    {
      onRequest: [app.authenticate, app.exigirPerfil(ACESSO.refeicoes)],
      schema: { body: z.object({ data, turno: z.enum(TURNOS), processoId: uuid, modalidade: z.enum(["Presencial", "Take-away"]) }) },
    },
    async (request, reply) => {
      const b = request.body;
      if (!(await prisma.processo.findUnique({ where: { id: b.processoId } }))) throw naoEncontrado("Processo não encontrado");
      if (await prisma.refeicaoPresenca.findFirst({ where: { data: b.data, turno: b.turno, processoId: b.processoId } })) {
        throw conflito("Presença já marcada para este turno.");
      }
      const p = await prisma.refeicaoPresenca.create({ data: { ...b, numDoses: 1 } });
      return reply.code(201).send(serialize(p));
    },
  );
}
