// Tarefas de arranque, idempotentes (podem correr a cada início do servidor).
import argon2 from "argon2";
import type { Config } from "./config.js";
import type { PrismaClient } from "./db.js";

const ARMAZENS = [
  { codigo: "BSA", designacao: "Banco Solidário de Alimentos" },
  { codigo: "RES", designacao: "Residência" },
  { codigo: "CDC", designacao: "Casa da Caridade" },
  { codigo: "BSR", designacao: "Banco Solidário de Roupa" },
];

// Os nomes têm de conter "Pessoa Só", "até 4" e "5+": é por eles que a app sugere o modelo certo.
const MODELOS_CABAZ = ["Semanal — Pessoa Só", "Semanal — Família até 4 pessoas", "Semanal — Família 5+ pessoas"];

/**
 * Dados de referência sem os quais a aplicação não funciona (os quatro armazéns e os modelos de
 * cabaz semanal, ainda sem artigos: a composição define-se na própria aplicação). Numa base
 * nova de produção não há seed, por isso são criados aqui.
 */
export async function garantirDadosBase(prisma: PrismaClient): Promise<void> {
  for (const a of ARMAZENS) {
    await prisma.armazem.upsert({ where: { codigo: a.codigo }, create: a, update: {} });
  }
  if ((await prisma.modeloCabaz.count()) === 0) {
    await prisma.modeloCabaz.createMany({
      data: MODELOS_CABAZ.map((nome) => ({ nome, tipologia: "Semanal", versao: 1, ativo: true, linhas: [] })),
    });
  }
}

/**
 * Se ainda não existe nenhum utilizador e BOOTSTRAP_ADMIN_EMAIL/PASSWORD estão definidos, cria a
 * primeira conta de Direção (com mudança de palavra-passe obrigatória no primeiro acesso). É a
 * forma de entrar numa instalação nova sem shell (ex.: Render). Depois de criada, as variáveis
 * podem ser apagadas.
 */
export async function garantirPrimeiraDirecao(
  prisma: PrismaClient,
  config: Config,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<void> {
  if ((await prisma.utilizador.count()) > 0) return;
  const email = config.BOOTSTRAP_ADMIN_EMAIL;
  const password = config.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    log.warn("Não há utilizadores. Defina BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD para criar a primeira conta de Direção.");
    return;
  }
  await prisma.utilizador.create({
    data: {
      nome: config.BOOTSTRAP_ADMIN_NAME,
      email: email.toLowerCase(),
      perfil: "Direção",
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      mustChangePassword: true,
    },
  });
  log.info(`Primeira conta de Direção criada: ${email} (tem de mudar a palavra-passe no primeiro acesso).`);
}
