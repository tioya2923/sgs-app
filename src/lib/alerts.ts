import type { ArmazemCodigo, Alerta, Database, Gravidade, Perfil, TipoAlerta } from "../types";
import { formatDate } from "./format";

// Um alerta só deve ser visível a quem tem, de facto, capacidade de o
// resolver — não basta "ver", tem de poder agir. Por isso cada tipo aponta
// para os mesmos perfis que já podem editar a área de onde o alerta vem,
// em vez de ficar aberto a todos por omissão.

// Processo/pessoa (secção 6.1: só Direção e Técnico veem "processos
// completos" e só eles editam fichas, acompanhamento e programas).
const TIPOS_PROCESSO: TipoAlerta[] = [
  "Pessoa sem reavaliação",
  "Documento caducado",
  "Inscrição a renovar",
  "Aniversário",
  "Ausência prolongada",
];

// Quem regista entradas em cada armazém (espelha exatamente o podeRegistar/
// podeRegistarEntrada já usado em cada página de existências).
const EDITA_ARMAZEM: Record<ArmazemCodigo, Perfil[]> = {
  BSA: ["Direção", "Armazém"],
  RES: ["Direção", "Armazém", "Cozinha"],
  CDC: ["Direção", "Armazém", "Cozinha"],
  BSR: ["Direção", "Armazém", "Voluntário — distribuição"],
};

const TIPOS_STOCK: TipoAlerta[] = ["Validade curta", "Stock abaixo do mínimo", "Produto esgotado"];

function artigoDoAlerta(alerta: Alerta, db: Database) {
  if (!alerta.entidadeId) return null;
  if (alerta.entidadeTipo === "Artigo") {
    return db.artigos.find((a) => a.id === alerta.entidadeId) ?? null;
  }
  if (alerta.entidadeTipo === "Lote") {
    const lote = db.lotes.find((l) => l.id === alerta.entidadeId);
    return lote ? db.artigos.find((a) => a.id === lote.artigoId) ?? null : null;
  }
  return null;
}

export function alertaVisivel(alerta: Alerta, perfil: Perfil, db: Database): boolean {
  if (perfil === "Direção") return true;

  if (TIPOS_PROCESSO.includes(alerta.tipo)) return perfil === "Técnico de ação social";

  if (alerta.tipo === "Cartão a expirar") return perfil === "Administrativo";

  if (TIPOS_STOCK.includes(alerta.tipo)) {
    const artigo = artigoDoAlerta(alerta, db);
    const armazem = artigo ? db.armazens.find((a) => a.id === artigo.armazemId) : null;
    if (!armazem) return false;
    return EDITA_ARMAZEM[armazem.codigo].includes(perfil);
  }

  return false;
}

function diasAte(dataISO: string, hoje: Date): number {
  const alvo = new Date(dataISO + "T00:00:00");
  return Math.round((alvo.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
}

function hojeSemHora(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

interface AlertaBase {
  chave: string;
  tipo: TipoAlerta;
  gravidade: Gravidade;
  entidade: string;
  entidadeTipo: string;
  entidadeId: string | null;
}

/**
 * Recalcula todos os alertas a partir do estado atual dos dados (secção 5.1).
 * O estado humano (ativo/tratado/adiado) vive em db.alertas e é aplicado por cima,
 * indexado pela mesma chave determinística tipo+entidade.
 */
export function computeAlertas(db: Database): Alerta[] {
  const hoje = hojeSemHora();
  const gerados: AlertaBase[] = [];

  // Validade curta — por lote, menos de 30 dias, ainda não expirado
  for (const lote of db.lotes) {
    if (!lote.validade || lote.estado !== "disponível" || lote.quantidade <= 0) continue;
    const dias = diasAte(lote.validade, hoje);
    if (dias >= 0 && dias <= 30) {
      const artigo = db.artigos.find((a) => a.id === lote.artigoId);
      gerados.push({
        chave: `validade-curta:${lote.id}`,
        tipo: "Validade curta",
        gravidade: dias <= 7 ? "Urgente" : "Atenção",
        entidade: `${artigo?.nome ?? "Artigo"} · lote de ${lote.quantidade} · vence a ${formatDate(lote.validade)}`,
        entidadeTipo: "Lote",
        entidadeId: lote.id,
      });
    }
  }

  // Stock abaixo do mínimo / esgotado — por artigo, tempo real
  for (const artigo of db.artigos) {
    const disponivel = db.lotes
      .filter((l) => l.artigoId === artigo.id && l.estado === "disponível")
      .reduce((soma, l) => soma + l.quantidade, 0);
    if (disponivel <= 0) {
      gerados.push({
        chave: `esgotado:${artigo.id}`,
        tipo: "Produto esgotado",
        gravidade: "Urgente",
        entidade: artigo.nome,
        entidadeTipo: "Artigo",
        entidadeId: artigo.id,
      });
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

  // Pessoa sem reavaliação — próxima avaliação já passou
  for (const processo of db.processos) {
    if (processo.estado !== "Ativo") continue;
    const dias = diasAte(processo.proximaAvaliacao, hoje);
    if (dias < 0) {
      const pessoa = db.pessoas.find((p) => p.id === processo.pessoaId);
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

  // Documento caducado — 30 dias antes (documento de identificação da pessoa)
  for (const pessoa of db.pessoas) {
    if (!pessoa.documentoValidade) continue;
    const dias = diasAte(pessoa.documentoValidade, hoje);
    if (dias <= 30) {
      gerados.push({
        chave: `documento-caducado:pessoa:${pessoa.id}`,
        tipo: "Documento caducado",
        gravidade: dias < 0 ? "Urgente" : "Atenção",
        entidade: `${pessoa.nome} · ${pessoa.documentoTipo} ${
          dias < 0 ? `caducado há ${-dias} dias` : `caduca em ${dias} dias`
        }`,
        entidadeTipo: "Pessoa",
        entidadeId: pessoa.id,
      });
    }
  }
  for (const documento of db.documentos) {
    if (!documento.validade) continue;
    const dias = diasAte(documento.validade, hoje);
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

  // Inscrição a renovar — renovação anual, 30 dias antes do fim
  for (const inscricao of db.inscricoes) {
    if (inscricao.estado !== "Ativa") continue;
    const fim = new Date(inscricao.data + "T00:00:00");
    fim.setFullYear(fim.getFullYear() + 1);
    const dias = diasAte(fim.toISOString().slice(0, 10), hoje);
    if (dias >= 0 && dias <= 30) {
      const processo = db.processos.find((p) => p.id === inscricao.processoId);
      const pessoa = processo ? db.pessoas.find((p) => p.id === processo.pessoaId) : undefined;
      gerados.push({
        chave: `inscricao-a-renovar:${inscricao.id}`,
        tipo: "Inscrição a renovar",
        gravidade: "Atenção",
        entidade: `${pessoa?.nome ?? "Pessoa"} · ${inscricao.programa} · renova em ${dias} dias`,
        entidadeTipo: "Inscrição",
        entidadeId: inscricao.id,
      });
    }
  }

  // Aniversário — no próprio dia
  for (const pessoa of db.pessoas) {
    const nasc = new Date(pessoa.dataNascimento + "T00:00:00");
    if (nasc.getMonth() === hoje.getMonth() && nasc.getDate() === hoje.getDate()) {
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

  // Ausência prolongada — 3 faltas seguidas às refeições OU 3 semanas sem levantar cabaz
  const processosAcompanhados = db.processos.filter((p) => p.estado === "Ativo");
  for (const processo of processosAcompanhados) {
    const entregas = db.entregasCabaz
      .filter((e) => e.processoId === processo.id)
      .sort((a, b) => b.dataPrevista.localeCompare(a.dataPrevista))
      .slice(0, 3);
    if (entregas.length === 3 && entregas.every((e) => e.estado === "Em falta")) {
      const pessoa = db.pessoas.find((p) => p.id === processo.pessoaId);
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

  // Ausência às refeições: olhar para os últimos 3 turnos em que o refeitório serviu,
  // desde a última presença conhecida do processo.
  const turnosOrdenados = Array.from(
    new Set(db.refeicoesContagem.map((r) => `${r.data}|${r.turno}`))
  ).sort();
  for (const processo of processosAcompanhados) {
    const presencas = new Set(
      db.refeicoesPresenca
        .filter((r) => r.processoId === processo.id)
        .map((r) => `${r.data}|${r.turno}`)
    );
    if (presencas.size === 0) continue;
    const ultimosTurnos = turnosOrdenados.slice(-3);
    const faltouAosUltimosTres =
      ultimosTurnos.length === 3 && ultimosTurnos.every((t) => !presencas.has(t));
    if (faltouAosUltimosTres) {
      const pessoa = db.pessoas.find((p) => p.id === processo.pessoaId);
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

  // Cartão a expirar — 7 dias antes. Um cartão Ativo cuja validade já passou
  // não some do radar: fica urgente em vez de deixar de gerar alerta.
  for (const cartao of db.cartoes) {
    if (cartao.estado !== "Ativo") continue;
    const dias = diasAte(cartao.validade, hoje);
    if (dias < 0) {
      gerados.push({
        chave: `cartao-a-expirar:${cartao.id}`,
        tipo: "Cartão a expirar",
        gravidade: "Urgente",
        entidade: `Cartão ${cartao.numero} · expirado há ${-dias} dias`,
        entidadeTipo: "Cartão",
        entidadeId: cartao.id,
      });
    } else if (dias <= 7) {
      gerados.push({
        chave: `cartao-a-expirar:${cartao.id}`,
        tipo: "Cartão a expirar",
        gravidade: "Atenção",
        entidade: `Cartão ${cartao.numero} · expira em ${dias} dias`,
        entidadeTipo: "Cartão",
        entidadeId: cartao.id,
      });
    }
  }

  const overrides = new Map(db.alertas.map((a) => [a.id, a]));

  return gerados.map((g) => {
    const anterior = overrides.get(g.chave);
    return {
      id: g.chave,
      tipo: g.tipo,
      gravidade: g.gravidade,
      entidade: g.entidade,
      entidadeTipo: g.entidadeTipo,
      entidadeId: g.entidadeId,
      geradoEm: anterior?.geradoEm ?? new Date().toISOString(),
      estado: anterior?.estado ?? "Ativo",
      motivoAdiamento: anterior?.motivoAdiamento ?? null,
      tratadoPor: anterior?.tratadoPor ?? null,
    } satisfies Alerta;
  });
}
