// Alertas automáticos (secção 5.1). Port fiel de src/lib/alerts.ts do frontend,
// agora calculado no servidor a partir da base de dados e filtrado por perfil
// antes de sair — quem não pode agir sobre um alerta nem chega a vê-lo.
import type { PrismaClient } from "../db.js";
import { diasEntre, hojeISO, somarAnos } from "../lib/datas.js";
import { EDITA_ARMAZEM } from "../domain/permissoes.js";
import type { Alerta, ArmazemCodigo, Gravidade, Perfil, TipoAlerta } from "../domain/types.js";

const TIPOS_PROCESSO: TipoAlerta[] = [
  "Pessoa sem reavaliação",
  "Documento caducado",
  "Inscrição a renovar",
  "Aniversário",
  "Ausência prolongada",
];
const TIPOS_STOCK: TipoAlerta[] = ["Validade curta", "Stock abaixo do mínimo", "Produto esgotado"];

export interface DadosAlertas {
  lotes: { id: string; artigoId: string; quantidade: number; validade: string | null; estado: string }[];
  artigos: { id: string; nome: string; unidade: string; stockMinimo: number; armazemId: string }[];
  armazens: { id: string; codigo: string }[];
  processos: { id: string; numero: number; pessoaId: string; estado: string; proximaAvaliacao: string }[];
  pessoas: { id: string; nome: string; dataNascimento: string; documentoTipo: string; documentoValidade: string | null }[];
  documentos: { id: string; tipo: string; ficheiro: string; validade: string | null }[];
  inscricoes: { id: string; processoId: string; programa: string; data: string; estado: string }[];
  entregasCabaz: { processoId: string | null; dataPrevista: string; estado: string }[];
  refeicoesContagem: { data: string; turno: string }[];
  refeicoesPresenca: { processoId: string | null; data: string; turno: string }[];
  cartoes: { id: string; numero: string; validade: string; estado: string }[];
  guardados: { id: string; geradoEm: Date; estado: string; motivoAdiamento: string | null; tratadoPor: string | null }[];
}

export async function carregarDadosAlertas(prisma: PrismaClient): Promise<DadosAlertas> {
  const [lotes, artigos, armazens, processos, pessoas, documentos, inscricoes, entregasCabaz, refeicoesContagem, refeicoesPresenca, cartoes, guardados] =
    await Promise.all([
      prisma.lote.findMany({ select: { id: true, artigoId: true, quantidade: true, validade: true, estado: true } }),
      prisma.artigo.findMany({ select: { id: true, nome: true, unidade: true, stockMinimo: true, armazemId: true } }),
      prisma.armazem.findMany({ select: { id: true, codigo: true } }),
      prisma.processo.findMany({ select: { id: true, numero: true, pessoaId: true, estado: true, proximaAvaliacao: true } }),
      prisma.pessoa.findMany({ select: { id: true, nome: true, dataNascimento: true, documentoTipo: true, documentoValidade: true } }),
      prisma.documento.findMany({ select: { id: true, tipo: true, ficheiro: true, validade: true } }),
      prisma.inscricao.findMany({ select: { id: true, processoId: true, programa: true, data: true, estado: true } }),
      prisma.entregaCabaz.findMany({ select: { processoId: true, dataPrevista: true, estado: true } }),
      prisma.refeicaoContagem.findMany({ select: { data: true, turno: true } }),
      prisma.refeicaoPresenca.findMany({ select: { processoId: true, data: true, turno: true } }),
      prisma.cartao.findMany({ select: { id: true, numero: true, validade: true, estado: true } }),
      prisma.alerta.findMany({ select: { id: true, geradoEm: true, estado: true, motivoAdiamento: true, tratadoPor: true } }),
    ]);
  return { lotes, artigos, armazens, processos, pessoas, documentos, inscricoes, entregasCabaz, refeicoesContagem, refeicoesPresenca, cartoes, guardados };
}

function dataPt(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

interface AlertaBase {
  chave: string;
  tipo: TipoAlerta;
  gravidade: Gravidade;
  entidade: string;
  entidadeTipo: string;
  entidadeId: string | null;
}

export function gerarAlertasBase(dados: DadosAlertas, hoje: string = hojeISO()): AlertaBase[] {
  const gerados: AlertaBase[] = [];
  const artigoPorId = new Map(dados.artigos.map((a) => [a.id, a]));
  const pessoaPorId = new Map(dados.pessoas.map((p) => [p.id, p]));
  const processoPorId = new Map(dados.processos.map((p) => [p.id, p]));

  // Validade curta — por lote, até 30 dias, ainda não expirado
  for (const lote of dados.lotes) {
    if (!lote.validade || lote.estado !== "disponível" || lote.quantidade <= 0) continue;
    const dias = diasEntre(hoje, lote.validade);
    if (dias >= 0 && dias <= 30) {
      const artigo = artigoPorId.get(lote.artigoId);
      gerados.push({
        chave: `validade-curta:${lote.id}`,
        tipo: "Validade curta",
        gravidade: dias <= 7 ? "Urgente" : "Atenção",
        entidade: `${artigo?.nome ?? "Artigo"} · lote de ${lote.quantidade} · caduca a ${dataPt(lote.validade)}`,
        entidadeTipo: "Lote",
        entidadeId: lote.id,
      });
    }
  }

  // Stock abaixo do mínimo / esgotado — por artigo
  for (const artigo of dados.artigos) {
    const disponivel = dados.lotes
      .filter((l) => l.artigoId === artigo.id && l.estado === "disponível")
      .reduce((soma, l) => soma + l.quantidade, 0);
    if (disponivel <= 0) {
      gerados.push({ chave: `esgotado:${artigo.id}`, tipo: "Produto esgotado", gravidade: "Urgente", entidade: artigo.nome, entidadeTipo: "Artigo", entidadeId: artigo.id });
    } else if (disponivel < artigo.stockMinimo) {
      gerados.push({
        chave: `stock-baixo:${artigo.id}`,
        tipo: "Stock abaixo do mínimo",
        gravidade: "Atenção",
        entidade: `${artigo.nome} · ${disponivel} ${artigo.unidade} (mínimo ${artigo.stockMinimo})`,
        entidadeTipo: "Artigo",
        entidadeId: artigo.id,
      });
    }
  }

  // Pessoa sem reavaliação
  for (const processo of dados.processos) {
    if (processo.estado !== "Ativo") continue;
    const dias = diasEntre(hoje, processo.proximaAvaliacao);
    if (dias < 0) {
      const pessoa = pessoaPorId.get(processo.pessoaId);
      gerados.push({
        chave: `sem-reavaliacao:${processo.id}`,
        tipo: "Pessoa sem reavaliação",
        gravidade: "Urgente",
        entidade: `${pessoa?.nome ?? "Pessoa"} · processo nº ${processo.numero} · vencida há ${-dias} dias`,
        entidadeTipo: "Processo",
        entidadeId: processo.id,
      });
    }
  }

  // Documento caducado — 30 dias antes
  for (const pessoa of dados.pessoas) {
    if (!pessoa.documentoValidade) continue;
    const dias = diasEntre(hoje, pessoa.documentoValidade);
    if (dias <= 30) {
      gerados.push({
        chave: `documento-caducado:pessoa:${pessoa.id}`,
        tipo: "Documento caducado",
        gravidade: dias < 0 ? "Urgente" : "Atenção",
        entidade: `${pessoa.nome} · ${pessoa.documentoTipo} ${dias < 0 ? `caducado há ${-dias} dias` : `caduca em ${dias} dias`}`,
        entidadeTipo: "Pessoa",
        entidadeId: pessoa.id,
      });
    }
  }
  for (const documento of dados.documentos) {
    if (!documento.validade) continue;
    const dias = diasEntre(hoje, documento.validade);
    if (dias <= 30) {
      gerados.push({
        chave: `documento-caducado:doc:${documento.id}`,
        tipo: "Documento caducado",
        gravidade: dias < 0 ? "Urgente" : "Atenção",
        entidade: `${documento.tipo} · ${documento.ficheiro}`,
        entidadeTipo: "Documento",
        entidadeId: documento.id,
      });
    }
  }

  // Inscrição a renovar — anual, 30 dias antes do fim; passada fica urgente
  for (const inscricao of dados.inscricoes) {
    if (inscricao.estado !== "Ativa") continue;
    const dias = diasEntre(hoje, somarAnos(inscricao.data, 1));
    if (dias <= 30) {
      const processo = processoPorId.get(inscricao.processoId);
      const pessoa = processo ? pessoaPorId.get(processo.pessoaId) : undefined;
      gerados.push({
        chave: `inscricao-a-renovar:${inscricao.id}`,
        tipo: "Inscrição a renovar",
        gravidade: dias < 0 ? "Urgente" : "Atenção",
        entidade: `${pessoa?.nome ?? "Pessoa"} · ${inscricao.programa} · ${dias < 0 ? `renovação vencida há ${-dias} dias` : `renova em ${dias} dias`}`,
        entidadeTipo: "Inscrição",
        entidadeId: inscricao.id,
      });
    }
  }

  // Aniversário — no próprio dia
  const hojeMesDia = hoje.slice(5);
  for (const pessoa of dados.pessoas) {
    if (pessoa.dataNascimento.slice(5) === hojeMesDia) {
      gerados.push({
        chave: `aniversario:${pessoa.id}`,
        tipo: "Aniversário",
        gravidade: "Informação",
        entidade: `${pessoa.nome} faz anos hoje`,
        entidadeTipo: "Pessoa",
        entidadeId: pessoa.id,
      });
    }
  }

  // Ausência prolongada — 3 cabazes seguidos em falta
  const acompanhados = dados.processos.filter((p) => p.estado === "Ativo");
  for (const processo of acompanhados) {
    const entregas = dados.entregasCabaz
      .filter((e) => e.processoId === processo.id)
      .sort((a, b) => b.dataPrevista.localeCompare(a.dataPrevista))
      .slice(0, 3);
    if (entregas.length === 3 && entregas.every((e) => e.estado === "Em falta")) {
      const pessoa = pessoaPorId.get(processo.pessoaId);
      gerados.push({
        chave: `ausencia-prolongada:cabaz:${processo.id}`,
        tipo: "Ausência prolongada",
        gravidade: "Urgente",
        entidade: `${pessoa?.nome ?? "Pessoa"} · sem levantar cabaz há 3 semanas`,
        entidadeTipo: "Processo",
        entidadeId: processo.id,
      });
    }
  }

  // Ausência às refeições — falhou os últimos 3 turnos servidos (só quem já tem histórico de presença)
  const turnos = Array.from(new Set(dados.refeicoesContagem.map((r) => `${r.data}|${r.turno}`))).sort();
  const ultimosTurnos = turnos.slice(-3);
  for (const processo of acompanhados) {
    const presencas = new Set(dados.refeicoesPresenca.filter((r) => r.processoId === processo.id).map((r) => `${r.data}|${r.turno}`));
    if (presencas.size === 0) continue;
    if (ultimosTurnos.length === 3 && ultimosTurnos.every((t) => !presencas.has(t))) {
      const pessoa = pessoaPorId.get(processo.pessoaId);
      gerados.push({
        chave: `ausencia-prolongada:refeicoes:${processo.id}`,
        tipo: "Ausência prolongada",
        gravidade: "Urgente",
        entidade: `${pessoa?.nome ?? "Pessoa"} · deixou de aparecer às refeições`,
        entidadeTipo: "Processo",
        entidadeId: processo.id,
      });
    }
  }

  // Cartão a expirar — 7 dias (Ativo) ou 14 dias (Por entregar); expirado fica urgente
  for (const cartao of dados.cartoes) {
    if (cartao.estado !== "Ativo" && cartao.estado !== "Por entregar") continue;
    const porEntregar = cartao.estado === "Por entregar";
    const dias = diasEntre(hoje, cartao.validade);
    if (dias < 0) {
      gerados.push({
        chave: `cartao-a-expirar:${cartao.id}`,
        tipo: "Cartão a expirar",
        gravidade: "Urgente",
        entidade: `Cartão ${cartao.numero} · ${porEntregar ? "nunca entregue, expirou" : "expirado"} há ${-dias} dias`,
        entidadeTipo: "Cartão",
        entidadeId: cartao.id,
      });
    } else if (dias <= (porEntregar ? 14 : 7)) {
      gerados.push({
        chave: `cartao-a-expirar:${cartao.id}`,
        tipo: "Cartão a expirar",
        gravidade: porEntregar && dias <= 7 ? "Urgente" : "Atenção",
        entidade: `Cartão ${cartao.numero} · ${porEntregar ? "ainda por entregar, expira" : "expira"} em ${dias} dias`,
        entidadeTipo: "Cartão",
        entidadeId: cartao.id,
      });
    }
  }

  return gerados;
}

/** Aplica o estado humano guardado (tratado/adiado) por cima dos alertas recalculados. */
export function computeAlertas(dados: DadosAlertas, hoje: string = hojeISO(), agora: Date = new Date()): Alerta[] {
  const guardados = new Map(dados.guardados.map((a) => [a.id, a]));
  return gerarAlertasBase(dados, hoje).map((g) => {
    const anterior = guardados.get(g.chave);
    return {
      id: g.chave,
      tipo: g.tipo,
      gravidade: g.gravidade,
      entidade: g.entidade,
      entidadeTipo: g.entidadeTipo,
      entidadeId: g.entidadeId,
      geradoEm: (anterior?.geradoEm ?? agora).toISOString(),
      estado: (anterior?.estado ?? "Ativo") as Alerta["estado"],
      motivoAdiamento: anterior?.motivoAdiamento ?? null,
      tratadoPor: anterior?.tratadoPor ?? null,
    };
  });
}

/** Um alerta só é visível a quem pode, de facto, agir sobre ele. */
export function alertaVisivel(alerta: Alerta, perfil: Perfil, dados: DadosAlertas): boolean {
  if (perfil === "Direção") return true;
  if (TIPOS_PROCESSO.includes(alerta.tipo)) return perfil === "Técnico de ação social";
  if (alerta.tipo === "Cartão a expirar") return perfil === "Administrativo";
  if (TIPOS_STOCK.includes(alerta.tipo)) {
    let artigoId: string | null = null;
    if (alerta.entidadeTipo === "Artigo") artigoId = alerta.entidadeId;
    else if (alerta.entidadeTipo === "Lote") artigoId = dados.lotes.find((l) => l.id === alerta.entidadeId)?.artigoId ?? null;
    const artigo = artigoId ? dados.artigos.find((a) => a.id === artigoId) : undefined;
    const armazem = artigo ? dados.armazens.find((a) => a.id === artigo.armazemId) : undefined;
    if (!armazem) return false;
    return EDITA_ARMAZEM[armazem.codigo as ArmazemCodigo].includes(perfil);
  }
  return false;
}

const PESO: Record<Gravidade, number> = { Urgente: 0, Atenção: 1, Informação: 2 };

export function alertasDoPerfil(dados: DadosAlertas, perfil: Perfil, hoje?: string): Alerta[] {
  return computeAlertas(dados, hoje)
    .filter((a) => alertaVisivel(a, perfil, dados))
    .sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade]);
}
