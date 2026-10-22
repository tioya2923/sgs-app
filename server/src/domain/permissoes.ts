// Fonte de verdade das permissões. O frontend (src/lib/nav.ts) só esconde a
// interface; aqui é onde se decide, de facto, quem lê e quem escreve.
import type { ArmazemCodigo, Perfil } from "./types.js";

export const PERFIS = [
  "Direção",
  "Técnico de ação social",
  "Voluntário — distribuição",
  "Cozinha",
  "Armazém",
  "Administrativo",
] as const satisfies readonly Perfil[];

const DIRECAO: Perfil = "Direção";
const TECNICO: Perfil = "Técnico de ação social";
const VOLUNTARIO: Perfil = "Voluntário — distribuição";
const COZINHA: Perfil = "Cozinha";
const ARMAZEM: Perfil = "Armazém";
const ADMIN: Perfil = "Administrativo";

/** A Direção pode sempre tudo o que é de gestão; as listas abaixo acrescentam os restantes perfis. */
function com(...perfis: Perfil[]): readonly Perfil[] {
  return [DIRECAO, ...perfis.filter((p) => p !== DIRECAO)];
}

export const ACESSO = {
  // Escrita por área (espelha os hasPerfil(...) de cada página do frontend)
  casos: com(TECNICO), // Porta Aberta: fichas, processos, atendimentos, contactos
  casosLeitura: com(TECNICO, VOLUNTARIO), // Porta Aberta (voluntário só vê composição)
  mensagens: com(TECNICO),
  cartoes: com(ADMIN),
  administracao: com(),
  modelosCabaz: com(TECNICO),
  cabazes: com(TECNICO, VOLUNTARIO, ARMAZEM), // montar/entregar cabaz
  roupaEntregas: com(TECNICO, VOLUNTARIO),
  refeicoes: com(TECNICO, COZINHA), // contagens e presenças
  relatorios: com(ADMIN),
} as const;

/** Quem regista entradas/saídas em cada armazém (também define a visibilidade dos alertas de stock). */
export const EDITA_ARMAZEM: Record<ArmazemCodigo, readonly Perfil[]> = {
  BSA: com(ARMAZEM),
  RES: com(ARMAZEM, COZINHA),
  CDC: com(ARMAZEM, COZINHA),
  BSR: com(ARMAZEM, VOLUNTARIO),
};

/** Armazéns cujo conteúdo cada perfil pode consultar (módulos a que tem acesso). */
export const LE_ARMAZEM: Record<ArmazemCodigo, readonly Perfil[]> = {
  BSA: com(TECNICO, VOLUNTARIO, ARMAZEM),
  RES: com(ARMAZEM, COZINHA),
  CDC: com(TECNICO, COZINHA, ARMAZEM),
  BSR: com(TECNICO, VOLUNTARIO, ARMAZEM),
};

export const TRANSFERE_ARMAZEM = com(ARMAZEM);

export function podeEditarArmazem(perfil: Perfil, codigo: ArmazemCodigo): boolean {
  return EDITA_ARMAZEM[codigo].includes(perfil);
}

export function podeLerArmazem(perfil: Perfil, codigo: ArmazemCodigo): boolean {
  return LE_ARMAZEM[codigo].includes(perfil);
}

export function armazensLegiveis(perfil: Perfil): ArmazemCodigo[] {
  return (Object.keys(LE_ARMAZEM) as ArmazemCodigo[]).filter((c) => LE_ARMAZEM[c].includes(perfil));
}

export type Nivel = "completo" | "composicao" | "minimo";

/** Quanto de cada pessoa/processo o perfil pode ver (secção 6.1 do esquema). */
export function nivelCasos(perfil: Perfil): Nivel {
  if (perfil === DIRECAO || perfil === TECNICO) return "completo";
  if (perfil === VOLUNTARIO) return "composicao";
  return "minimo";
}

export function temPerfil(perfil: Perfil, permitidos: readonly Perfil[]): boolean {
  return permitidos.includes(perfil);
}
