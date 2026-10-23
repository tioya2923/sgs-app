// Dados de demonstração. Uso: npm run db:seed
// Apaga tudo e repõe os dados de exemplo (nunca corre em produção sem SEED_FORCE=1).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { createPrisma } from "../src/db.js";
import { buildSeed } from "./demo-data.js";

const TABELAS = [
  "refresh_tokens", "registos_acesso", "mensagens", "alertas", "cartoes",
  "refeicoes_presenca", "refeicoes_contagem", "entregas_roupa", "entregas_cabaz",
  "modelos_cabaz", "movimentos", "lotes", "artigos", "armazens", "atendimentos",
  "inscricoes", "documentos", "contactos", "processos", "pessoas", "agregados",
  "utilizadores",
];

export async function seed(databaseUrl: string, password: string, mustChangePassword: boolean) {
  const prisma = createPrisma(databaseUrl);
  try {
    const demo = buildSeed();

    // Os ids do frontend ("art-0018") passam a UUIDs; todas as referências são reescritas.
    const ids = new Map<string, string>();
    const novo = (antigo: string): string => {
      let id = ids.get(antigo);
      if (!id) {
        id = randomUUID();
        ids.set(antigo, id);
      }
      return id;
    };
    const ref = (antigo: string | null | undefined): string | null => (antigo ? novo(antigo) : null);
    const linhasRef = (linhas: { artigoId: string; quantidade: number }[]) =>
      linhas.map((l) => ({ artigoId: novo(l.artigoId), quantidade: l.quantidade }));

    await prisma.$executeRawUnsafe(`TRUNCATE ${TABELAS.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    await prisma.utilizador.createMany({
      data: demo.utilizadores.map((u) => ({
        id: novo(u.id),
        nome: u.nome,
        perfil: u.perfil,
        email: u.email.toLowerCase(),
        passwordHash,
        ativo: u.ativo,
        ultimoAcesso: u.ultimoAcesso ? new Date(`${u.ultimoAcesso}T09:00:00`) : null,
        mustChangePassword,
      })),
    });

    await prisma.agregado.createMany({
      data: demo.agregados.map((a) => ({ ...a, id: novo(a.id) })),
    });
    await prisma.pessoa.createMany({
      data: demo.pessoas.map((p) => ({ ...p, id: novo(p.id), agregadoId: novo(p.agregadoId) })),
    });
    await prisma.processo.createMany({
      data: demo.processos.map((p) => ({ ...p, id: novo(p.id), pessoaId: novo(p.pessoaId) })),
    });
    await prisma.contacto.createMany({
      data: demo.contactos.map((c) => ({ ...c, id: novo(c.id), pessoaId: novo(c.pessoaId) })),
    });
    await prisma.documento.createMany({
      data: demo.documentos.map((d) => ({ ...d, id: novo(d.id), processoId: novo(d.processoId) })),
    });
    await prisma.inscricao.createMany({
      data: demo.inscricoes.map((i) => ({ ...i, id: novo(i.id), processoId: novo(i.processoId) })),
    });
    await prisma.atendimento.createMany({
      data: demo.atendimentos.map((a) => ({ ...a, id: novo(a.id), processoId: novo(a.processoId) })),
    });

    await prisma.armazem.createMany({ data: demo.armazens.map((a) => ({ ...a, id: novo(a.id) })) });
    await prisma.artigo.createMany({
      data: demo.artigos.map((a) => ({ ...a, id: novo(a.id), armazemId: novo(a.armazemId) })),
    });
    await prisma.lote.createMany({
      data: demo.lotes.map((l) => ({ ...l, id: novo(l.id), artigoId: novo(l.artigoId) })),
    });
    await prisma.movimento.createMany({
      // movimentos com quantidade 0 (exemplos antigos) não têm significado: a BD exige > 0
      data: demo.movimentos.filter((m) => m.quantidade > 0).map((m) => ({
        ...m,
        id: novo(m.id),
        artigoId: novo(m.artigoId),
        loteId: ref(m.loteId),
      })),
    });

    await prisma.modeloCabaz.createMany({
      data: demo.modelosCabaz.map((m) => ({ ...m, id: novo(m.id), linhas: linhasRef(m.linhas) })),
    });
    await prisma.entregaCabaz.createMany({
      data: demo.entregasCabaz.map((e) => ({
        ...e,
        id: novo(e.id),
        agregadoId: ref(e.agregadoId),
        processoId: ref(e.processoId),
        modeloId: ref(e.modeloId),
        linhas: linhasRef(e.linhas),
      })),
    });
    await prisma.entregaRoupa.createMany({
      data: demo.entregasRoupa.map((e) => ({ ...e, id: novo(e.id), processoId: ref(e.processoId), artigos: e.artigos.map((i) => ({ ...i })) })),
    });
    await prisma.refeicaoContagem.createMany({
      data: demo.refeicoesContagem.map((r) => ({ ...r, id: novo(r.id) })),
    });
    await prisma.refeicaoPresenca.createMany({
      data: demo.refeicoesPresenca.map((r) => ({ ...r, id: novo(r.id), processoId: ref(r.processoId) })),
    });
    await prisma.cartao.createMany({
      data: demo.cartoes.map((c) => ({
        ...c,
        id: novo(c.id),
        agregadoId: ref(c.agregadoId),
        processoId: ref(c.processoId),
      })),
    });
    await prisma.mensagem.createMany({
      data: demo.mensagens.map((m) => ({
        ...m,
        id: novo(m.id),
        processoId: ref(m.processoId),
        agendada: new Date(m.agendada.length > 10 ? m.agendada : `${m.agendada}T09:00:00`),
        enviada: m.enviada ? new Date(m.enviada.length > 10 ? m.enviada : `${m.enviada}T09:00:00`) : null,
      })),
    });
    await prisma.registoAcesso.createMany({
      data: demo.registosAcesso.map((r) => ({
        id: novo(r.id),
        utilizador: r.utilizador,
        acao: r.acao,
        entidade: r.entidade,
        dataHora: new Date(r.dataHora),
      })),
    });

    return { utilizadores: demo.utilizadores.length };
  } finally {
    await prisma.$disconnect();
  }
}

// Execução direta: npm run db:seed
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("seed.ts")) {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL em falta");
  if (process.env["NODE_ENV"] === "production" && process.env["SEED_FORCE"] !== "1") {
    throw new Error("Recusado: o seed apaga todos os dados. Em produção só com SEED_FORCE=1.");
  }
  const password = process.env["SEED_PASSWORD"] ?? "Demo-Sgs-2026!";
  const r = await seed(url, password, process.env["NODE_ENV"] === "production");
  console.log(`Seed concluído (${r.utilizadores} utilizadores de demonstração).`);
}
