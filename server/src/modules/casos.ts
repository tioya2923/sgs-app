// Porta Aberta: agregados, pessoas, processos, contactos e atendimentos.
// Só Direção e Técnico de ação social escrevem (secção 6.1 do esquema).
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ACESSO } from "../domain/permissoes.js";
import {
  DOCUMENTOS_TIPO, ESTADOS_CIVIS, ESTADOS_PROCESSO, PARENTESCOS, SITUACOES_HABITACIONAIS,
  TIPOS_ATENDIMENTO, TIPOS_CONTACTO, data, idParam, periodicidade, processoNovo, texto, textoOpc,
} from "../domain/schemas.js";
import { hojeISO, periodicidadeEmMeses, somarMeses } from "../lib/datas.js";
import { conflito, naoEncontrado } from "../lib/errors.js";
import { registarAcesso } from "../lib/audit.js";
import { serialize } from "../lib/serialize.js";
import { recalcularAgregado } from "../services/agregados.js";
import { proximoCodigoAgregado, proximoNumeroProcesso } from "../services/numeracao.js";
import type { Tx } from "../services/stock.js";

const dinheiro = z.number().min(0).max(1_000_000);

const agregadoCampos = z.object({
  morada: texto(),
  freguesia: texto(100),
  situacaoHabitacional: z.enum(SITUACOES_HABITACIONAIS),
  rendimentoTotal: dinheiro,
});

const titularCampos = z.object({
  nome: texto(),
  dataNascimento: data,
  nacionalidade: texto(80),
  estadoCivil: z.enum(ESTADOS_CIVIS),
  nif: textoOpc(20),
});

async function abrirProcesso(tx: Tx, pessoaId: string, p: z.infer<typeof processoNovo>) {
  const hoje = hojeISO();
  return tx.processo.create({
    data: {
      numero: await proximoNumeroProcesso(tx),
      pessoaId,
      tecnicaReferencia: p.tecnicaReferencia,
      dataAbertura: hoje,
      estado: "Ativo",
      periodicidadeReavaliacao: p.periodicidade,
      proximaAvaliacao: somarMeses(hoje, periodicidadeEmMeses(p.periodicidade)),
    },
  });
}

export async function casosRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { prisma } = app;
  const pre = [app.authenticate, app.exigirPerfil(ACESSO.casos)];

  // --------------------------------------------------------------- agregados
  r.post(
    "/agregados",
    {
      onRequest: pre,
      schema: {
        body: z.object({
          agregado: agregadoCampos,
          titular: titularCampos,
          telefone: textoOpc(40).optional(),
          processo: processoNovo.optional(),
        }),
      },
    },
    async (request, reply) => {
      const { agregado, titular, telefone, processo } = request.body;
      const hoje = hojeISO();
      const criado = await prisma.$transaction(async (tx) => {
        const ag = await tx.agregado.create({
          data: { ...agregado, codigo: await proximoCodigoAgregado(tx), dataAbertura: hoje },
        });
        const pessoa = await tx.pessoa.create({
          data: {
            ...titular,
            agregadoId: ag.id,
            documentoTipo: "Cartão de Cidadão",
            parentesco: "Titular",
            temProcessoProprio: Boolean(processo),
          },
        });
        const contacto = telefone
          ? await tx.contacto.create({
              data: { pessoaId: pessoa.id, tipo: "Telemóvel", valor: telefone, consentimento: true, dataConsentimento: hoje, preferencial: true },
            })
          : null;
        const proc = processo ? await abrirProcesso(tx, pessoa.id, processo) : null;
        await recalcularAgregado(tx, ag.id);
        return { agregado: await tx.agregado.findUniqueOrThrow({ where: { id: ag.id } }), pessoa, contacto, processo: proc };
      });
      await registarAcesso(prisma, request.auth.nome, "Criou agregado", criado.agregado.codigo);
      return reply.code(201).send(serialize(criado));
    },
  );

  r.patch("/agregados/:id", { onRequest: pre, schema: { params: idParam, body: agregadoCampos.partial() } }, async (request) => {
    const ag = await prisma.agregado.update({ where: { id: request.params.id }, data: request.body });
    await registarAcesso(prisma, request.auth.nome, "Editou agregado", ag.codigo);
    return serialize(ag);
  });

  r.delete("/agregados/:id", { onRequest: pre, schema: { params: idParam } }, async (request, reply) => {
    const ag = await prisma.agregado.findUnique({ where: { id: request.params.id } });
    if (!ag) throw naoEncontrado();
    // Pessoas, processos (com atendimentos, documentos e inscrições) e contactos caem em
    // cascata; cabazes, cartões, refeições e mensagens ficam como histórico (FK a NULL).
    await prisma.agregado.delete({ where: { id: ag.id } });
    await registarAcesso(prisma, request.auth.nome, "Eliminou agregado", ag.codigo);
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ pessoas
  r.post(
    "/agregados/:id/pessoas",
    {
      onRequest: pre,
      schema: {
        params: idParam,
        body: z.object({
          nome: texto(),
          dataNascimento: data,
          nacionalidade: texto(80),
          parentesco: z.enum(PARENTESCOS).refine((p) => p !== "Titular", "O titular é a primeira pessoa do agregado"),
          processo: processoNovo.optional(),
        }),
      },
    },
    async (request, reply) => {
      const { processo, ...campos } = request.body;
      const agregadoId = request.params.id;
      const criado = await prisma.$transaction(async (tx) => {
        if (!(await tx.agregado.findUnique({ where: { id: agregadoId } }))) throw naoEncontrado("Agregado não encontrado");
        const pessoa = await tx.pessoa.create({
          data: { ...campos, agregadoId, estadoCivil: "Solteiro(a)", documentoTipo: "Cartão de Cidadão", temProcessoProprio: Boolean(processo) },
        });
        const proc = processo ? await abrirProcesso(tx, pessoa.id, processo) : null;
        await recalcularAgregado(tx, agregadoId);
        return { pessoa, processo: proc };
      });
      await registarAcesso(prisma, request.auth.nome, "Adicionou pessoa a agregado", agregadoId);
      return reply.code(201).send(serialize(criado));
    },
  );

  r.patch(
    "/pessoas/:id",
    {
      onRequest: pre,
      schema: {
        params: idParam,
        body: z
          .object({
            nome: texto(),
            dataNascimento: data,
            nacionalidade: texto(80),
            estadoCivil: z.enum(ESTADOS_CIVIS),
            parentesco: z.enum(PARENTESCOS),
            nif: textoOpc(20),
            documentoTipo: z.enum(DOCUMENTOS_TIPO),
            documentoNumero: textoOpc(40),
            documentoValidade: data.nullable(),
            restricoesAlimentares: z.array(texto(100)).max(30),
            incapacidade: z.boolean(),
          })
          .partial(),
      },
    },
    async (request) => {
      const pessoa = await prisma.$transaction(async (tx) => {
        const p = await tx.pessoa.update({ where: { id: request.params.id }, data: request.body });
        await recalcularAgregado(tx, p.agregadoId); // a data de nascimento pode mudar o nº de menores
        return p;
      });
      await registarAcesso(prisma, request.auth.nome, "Editou pessoa", pessoa.id);
      return serialize(pessoa);
    },
  );

  r.delete("/pessoas/:id", { onRequest: pre, schema: { params: idParam } }, async (request, reply) => {
    await prisma.$transaction(async (tx) => {
      const pessoa = await tx.pessoa.findUnique({ where: { id: request.params.id } });
      if (!pessoa) throw naoEncontrado();
      const total = await tx.pessoa.count({ where: { agregadoId: pessoa.agregadoId } });
      if (total <= 1) throw conflito("Para remover a última pessoa do agregado, elimine o agregado.");
      await tx.pessoa.delete({ where: { id: pessoa.id } }); // processo e contactos em cascata
      await recalcularAgregado(tx, pessoa.agregadoId);
    });
    await registarAcesso(prisma, request.auth.nome, "Removeu pessoa", request.params.id);
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------- processos
  r.post("/pessoas/:id/processo", { onRequest: pre, schema: { params: idParam, body: processoNovo } }, async (request, reply) => {
    const proc = await prisma.$transaction(async (tx) => {
      const pessoa = await tx.pessoa.findUnique({ where: { id: request.params.id } });
      if (!pessoa) throw naoEncontrado();
      if (await tx.processo.findFirst({ where: { pessoaId: pessoa.id } })) throw conflito("Esta pessoa já tem processo de acompanhamento.");
      const novo = await abrirProcesso(tx, pessoa.id, request.body);
      await tx.pessoa.update({ where: { id: pessoa.id }, data: { temProcessoProprio: true } });
      return novo;
    });
    await registarAcesso(prisma, request.auth.nome, "Abriu processo", `nº ${proc.numero}`);
    return reply.code(201).send(serialize(proc));
  });

  r.patch(
    "/processos/:id",
    {
      onRequest: pre,
      schema: {
        params: idParam,
        body: z
          .object({
            tecnicaReferencia: texto(),
            estado: z.enum(ESTADOS_PROCESSO),
            periodicidadeReavaliacao: periodicidade,
            proximaAvaliacao: data,
          })
          .partial(),
      },
    },
    async (request) => {
      const proc = await prisma.processo.update({ where: { id: request.params.id }, data: request.body });
      await registarAcesso(prisma, request.auth.nome, "Editou processo", `nº ${proc.numero}`);
      return serialize(proc);
    },
  );

  r.delete("/processos/:id", { onRequest: pre, schema: { params: idParam } }, async (request, reply) => {
    const proc = await prisma.$transaction(async (tx) => {
      const p = await tx.processo.findUnique({ where: { id: request.params.id } });
      if (!p) throw naoEncontrado();
      await tx.processo.delete({ where: { id: p.id } }); // atendimentos, documentos e inscrições em cascata
      await tx.pessoa.update({ where: { id: p.pessoaId }, data: { temProcessoProprio: false } });
      return p;
    });
    await registarAcesso(prisma, request.auth.nome, "Eliminou processo", `nº ${proc.numero}`);
    return reply.code(204).send();
  });

  // ------------------------------------------------------------- atendimentos
  r.post(
    "/processos/:id/atendimentos",
    {
      onRequest: pre,
      schema: {
        params: idParam,
        body: z.object({
          tipo: z.enum(TIPOS_ATENDIMENTO),
          motivo: texto(),
          observacoes: textoOpc().default(""),
          necessidadesDetetadas: z.array(texto(100)).max(30).default([]),
          encaminhamento: textoOpc(500).default(""),
          proximaAvaliacao: data.nullable().default(null),
        }),
      },
    },
    async (request, reply) => {
      const proc = await prisma.processo.findUnique({ where: { id: request.params.id } });
      if (!proc) throw naoEncontrado();
      const at = await prisma.atendimento.create({
        data: {
          ...request.body,
          processoId: proc.id,
          data: hojeISO(),
          proximaAvaliacao: request.body.proximaAvaliacao ?? proc.proximaAvaliacao,
          tecnico: request.auth.nome, // vem da sessão, nunca do pedido
        },
      });
      await registarAcesso(prisma, request.auth.nome, "Registou atendimento", `Processo nº ${proc.numero}`);
      return reply.code(201).send(serialize(at));
    },
  );

  // --------------------------------------------------------------- contactos
  r.post(
    "/pessoas/:id/contactos",
    {
      onRequest: pre,
      schema: {
        params: idParam,
        body: z.object({
          tipo: z.enum(TIPOS_CONTACTO),
          valor: texto(200),
          preferencial: z.boolean().default(false),
          consentimento: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      if (!(await prisma.pessoa.findUnique({ where: { id: request.params.id } }))) throw naoEncontrado();
      const c = await prisma.contacto.create({
        data: {
          ...request.body,
          pessoaId: request.params.id,
          dataConsentimento: request.body.consentimento ? hojeISO() : null,
        },
      });
      await registarAcesso(prisma, request.auth.nome, "Adicionou contacto", request.params.id);
      return reply.code(201).send(serialize(c));
    },
  );

  r.delete("/contactos/:id", { onRequest: pre, schema: { params: idParam } }, async (request, reply) => {
    const c = await prisma.contacto.delete({ where: { id: request.params.id } });
    await registarAcesso(prisma, request.auth.nome, "Removeu contacto", c.pessoaId);
    return reply.code(204).send();
  });
}
