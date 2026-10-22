import { z } from "zod";
import { PERFIS } from "./permissoes.js";

// Valores permitidos — os mesmos literais de src/types.ts do frontend.
export const SITUACOES_HABITACIONAIS = ["Arrendada", "Própria", "Cedida", "Ocupação", "Sem-abrigo", "Outra"] as const;
export const ESTADOS_CIVIS = ["Solteiro(a)", "Casado(a)", "União de facto", "Divorciado(a)", "Viúvo(a)"] as const;
export const PARENTESCOS = ["Titular", "Cônjuge", "Filho(a)", "Neto(a)", "Pai/Mãe", "Outro"] as const;
export const DOCUMENTOS_TIPO = ["Cartão de Cidadão", "Título de Residência", "Passaporte", "Sem documento"] as const;
export const ESTADOS_PROCESSO = ["Ativo", "Suspenso", "Encerrado"] as const;
export const PERIODICIDADES = ["Mensal", "Trimestral", "Semestral"] as const;
export const TIPOS_CONTACTO = ["Telemóvel", "Telefone fixo", "Email"] as const;
export const TIPOS_ATENDIMENTO = ["Primeira consulta", "Acompanhamento", "Reavaliação", "Emergência"] as const;
export const TURNOS = ["Almoço", "Jantar"] as const;
export const ESTADOS_ROUPA = ["Novo", "Bom estado", "Usado"] as const;
export const CANAIS = ["SMS", "Email"] as const;

export const uuid = z.string().uuid();
export const idParam = z.object({ id: uuid });
/** Data de calendário AAAA-MM-DD, realmente existente. */
export const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Data inexistente");

export const texto = (max = 300) => z.string().trim().min(1, "Campo obrigatório").max(max);
export const textoOpc = (max = 2000) => z.string().trim().max(max);
export const quantidade = z.number().int("Tem de ser um número inteiro").positive("Tem de ser maior que zero").max(1_000_000);

export const perfil = z.enum(PERFIS);
export const periodicidade = z.enum(PERIODICIDADES);

export const processoNovo = z.object({
  tecnicaReferencia: texto(),
  periodicidade,
});
