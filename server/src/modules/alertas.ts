import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { textoOpc } from "../domain/schemas.js";
import { conflito, naoEncontrado } from "../lib/errors.js";
import { serialize } from "../lib/serialize.js";
import { alertasDoPerfil, carregarDadosAlertas } from "../services/alertas.js";

export async function alertasRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { prisma } = app;

  r.get("/alertas", { onRequest: app.authenticate }, async (request) => {
    return serialize(alertasDoPerfil(await carregarDadosAlertas(prisma), request.auth.perfil));
  });

  // O alerta em si é recalculado; só o estado humano (tratado/adiado) se guarda.
  r.put(
    "/alertas/:id/estado",
    {
      onRequest: app.authenticate,
      schema: {
        params: z.object({ id: z.string().min(1).max(200) }),
        body: z.object({ estado: z.enum(["Ativo", "Tratado", "Adiado"]), motivoAdiamento: textoOpc(300).nullable().optional() }),
      },
    },
    async (request) => {
      const alerta = alertasDoPerfil(await carregarDadosAlertas(prisma), request.auth.perfil).find((a) => a.id === request.params.id);
      if (!alerta) throw naoEncontrado("Alerta não encontrado ou sem permissão para o tratar");
      const { estado } = request.body;
      const motivo = estado === "Adiado" ? request.body.motivoAdiamento || "Sem motivo indicado" : null;
      if (estado === "Adiado" && !motivo) throw conflito("Indique o motivo do adiamento.");

      const guardado = await prisma.alerta.upsert({
        where: { id: alerta.id },
        create: {
          id: alerta.id, tipo: alerta.tipo, gravidade: alerta.gravidade, entidade: alerta.entidade,
          entidadeTipo: alerta.entidadeTipo, entidadeId: alerta.entidadeId, geradoEm: new Date(alerta.geradoEm),
          estado, motivoAdiamento: motivo, tratadoPor: request.auth.nome,
        },
        update: { estado, motivoAdiamento: motivo, tratadoPor: request.auth.nome },
      });
      return serialize(guardado);
    },
  );
}
