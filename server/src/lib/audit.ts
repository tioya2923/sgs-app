import type { PrismaClient } from "../db.js";

/** Auditoria de acessos (RGPD): quem fez o quê e a que entidade. Nunca guarda dados pessoais, só referências. */
export async function registarAcesso(
  prisma: Pick<PrismaClient, "registoAcesso">,
  utilizador: string,
  acao: string,
  entidade: string,
): Promise<void> {
  await prisma.registoAcesso.create({ data: { utilizador, acao, entidade } });
}
