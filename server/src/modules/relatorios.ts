import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ACESSO } from "../domain/permissoes.js";
import { hojeISO } from "../lib/datas.js";
import { registarAcesso } from "../lib/audit.js";

/** CSV compatível com o Excel em português (separador ';', BOM UTF-8) e protegido contra injeção de fórmulas. */
function csv(linhas: string[][]): string {
  const celula = (v: string) => {
    const seguro = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${seguro.replace(/"/g, '""')}"`;
  };
  return "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
}

export async function relatoriosRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { prisma } = app;
  const pre = [app.authenticate, app.exigirPerfil(ACESSO.relatorios)];

  async function porFreguesia(inicioMes: string) {
    const [agregados, cabazes] = await Promise.all([
      prisma.agregado.findMany({ select: { id: true, freguesia: true, numPessoas: true } }),
      prisma.entregaCabaz.findMany({ where: { estado: "Entregue", dataPrevista: { gte: inicioMes } }, select: { agregadoId: true } }),
    ]);
    const mapa = new Map<string, { freguesia: string; agregados: number; pessoas: number; cabazes: number }>();
    for (const a of agregados) {
      const e = mapa.get(a.freguesia) ?? { freguesia: a.freguesia, agregados: 0, pessoas: 0, cabazes: 0 };
      e.agregados += 1;
      e.pessoas += a.numPessoas;
      e.cabazes += cabazes.filter((c) => c.agregadoId === a.id).length;
      mapa.set(a.freguesia, e);
    }
    return Array.from(mapa.values()).sort((a, b) => b.pessoas - a.pessoas);
  }

  r.get("/relatorios/resumo", { onRequest: pre }, async () => {
    const inicioMes = `${hojeISO().slice(0, 8)}01`;
    const [cabazesMes, refeicoes, roupaMes, novosProcessosMes, financiadores, freguesias] = await Promise.all([
      prisma.entregaCabaz.count({ where: { estado: "Entregue", dataPrevista: { gte: inicioMes } } }),
      prisma.refeicaoContagem.aggregate({ where: { data: { gte: inicioMes } }, _sum: { numPessoas: true } }),
      prisma.entregaRoupa.count({ where: { data: { gte: inicioMes } } }),
      prisma.processo.count({ where: { dataAbertura: { gte: inicioMes } } }),
      prisma.cartao.groupBy({ by: ["origemFundo"], _count: { _all: true }, _sum: { valor: true } }),
      porFreguesia(inicioMes),
    ]);
    return {
      cabazesMes,
      refeicoesMes: refeicoes._sum.numPessoas ?? 0,
      roupaMes,
      novosProcessosMes,
      porFreguesia: freguesias,
      porFinanciador: financiadores.map((f) => ({ origem: f.origemFundo, cartoes: f._count._all, valor: f._sum.valor?.toNumber() ?? 0 })),
    };
  });

  r.get(
    "/relatorios/agregados.csv",
    { onRequest: pre, schema: { querystring: z.object({ anonimizar: z.enum(["true", "false"]).default("true") }) } },
    async (request, reply) => {
      const anonimizar = request.query.anonimizar === "true";
      const agregados = await prisma.agregado.findMany({ orderBy: { codigo: "asc" } });
      const linhas = [
        ["Código", "Freguesia", "Nº pessoas", "Nº menores", "Situação habitacional", ...(anonimizar ? [] : ["Morada"])],
        ...agregados.map((a) => [a.codigo, a.freguesia, String(a.numPessoas), String(a.numMenores), a.situacaoHabitacional, ...(anonimizar ? [] : [a.morada])]),
      ];
      await registarAcesso(prisma, request.auth.nome, anonimizar ? "Exportou agregados (anónimo)" : "Exportou agregados (com moradas)", "Relatórios");
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", 'attachment; filename="agregados.csv"')
        .send(csv(linhas));
    },
  );

  r.get("/relatorios/mapa-freguesias.csv", { onRequest: pre }, async (request, reply) => {
    const dados = await porFreguesia(`${hojeISO().slice(0, 8)}01`);
    await registarAcesso(prisma, request.auth.nome, "Exportou mapa por freguesia", "Relatórios");
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", 'attachment; filename="mapa-freguesias.csv"')
      .send(csv([["Freguesia", "Agregados", "Pessoas", "Cabazes entregues (mês)"], ...dados.map((d) => [d.freguesia, String(d.agregados), String(d.pessoas), String(d.cabazes)])]));
  });
}
