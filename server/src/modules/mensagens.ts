// Mensagens a beneficiários. O envio real (SMS/e-mail) ainda não está ligado a
// nenhum fornecedor: as mensagens ficam registadas como enviadas/agendadas.
// As regras de consentimento são aplicadas aqui, não na interface.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ACESSO } from "../domain/permissoes.js";
import { CANAIS, idParam, texto, uuid } from "../domain/schemas.js";
import { conflito, invalido, naoEncontrado } from "../lib/errors.js";
import { registarAcesso } from "../lib/audit.js";
import { serialize } from "../lib/serialize.js";

const CUSTO_SMS = 0.05;

export async function mensagensRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { prisma } = app;
  const pre = [app.authenticate, app.exigirPerfil(ACESSO.mensagens)];

  r.post(
    "/mensagens",
    {
      onRequest: pre,
      schema: {
        body: z
          .object({
            destinatarios: z.union([z.literal("todos"), z.object({ processoId: uuid })]),
            canal: z.enum(CANAIS),
            modelo: texto(150),
            conteudoFinal: texto(1000),
            quando: z.enum(["agora", "agendar"]),
            // Instante com fuso (ISO 8601), ex.: 2026-10-23T09:00:00.000Z
            agendada: z.string().datetime({ offset: true }).optional(),
          })
          .refine((b) => b.quando === "agora" || Boolean(b.agendada), "Indique quando agendar"),
      },
    },
    async (request, reply) => {
      const b = request.body;
      const tipoContacto = b.canal === "SMS" ? "Telemóvel" : "Email";
      const agora = new Date();

      const processos =
        b.destinatarios === "todos"
          ? await prisma.processo.findMany({ where: { estado: "Ativo" }, include: { pessoa: { include: { contactos: true } } } })
          : await prisma.processo.findMany({ where: { id: b.destinatarios.processoId }, include: { pessoa: { include: { contactos: true } } } });
      if (processos.length === 0) throw naoEncontrado("Destinatário não encontrado");

      let semContacto = 0;
      let semConsentimento = 0;
      const criar = [];
      for (const p of processos) {
        const contacto = p.pessoa.contactos.find((c) => c.tipo === tipoContacto);
        if (!contacto) { semContacto++; continue; }
        if (!contacto.consentimento) { semConsentimento++; continue; }
        criar.push({
          processoId: p.id,
          canal: b.canal,
          modelo: b.modelo,
          conteudoFinal: b.conteudoFinal,
          agendada: b.quando === "agora" ? agora : new Date(b.agendada!),
          enviada: b.quando === "agora" ? agora : null,
          estadoEntrega: b.quando === "agora" ? "Enviada" : "Agendada",
          custo: b.canal === "SMS" ? CUSTO_SMS : 0,
        });
      }

      if (b.destinatarios !== "todos") {
        if (semContacto) throw conflito("Esta pessoa não tem contacto registado por este canal.");
        if (semConsentimento) throw conflito("Esta pessoa não deu consentimento para contacto por este canal.");
      }
      if (criar.length === 0) throw invalido("Nenhum destinatário elegível (sem contacto ou sem consentimento).");

      await prisma.mensagem.createMany({ data: criar });
      await registarAcesso(prisma, request.auth.nome, `Enviou/agendou ${criar.length} mensagem(ns) por ${b.canal}`, "Mensagens");
      return reply.code(201).send(serialize({ criadas: criar.length, semContacto, semConsentimento }));
    },
  );

  r.delete("/mensagens/:id", { onRequest: pre, schema: { params: idParam } }, async (request, reply) => {
    const m = await prisma.mensagem.findUnique({ where: { id: request.params.id } });
    if (!m) throw naoEncontrado();
    if (m.estadoEntrega !== "Agendada" || m.agendada <= new Date()) {
      throw conflito("Só é possível cancelar mensagens agendadas que ainda não saíram.");
    }
    await prisma.mensagem.delete({ where: { id: m.id } });
    await registarAcesso(prisma, request.auth.nome, "Cancelou mensagem agendada", "Mensagens");
    return reply.code(204).send();
  });
}
