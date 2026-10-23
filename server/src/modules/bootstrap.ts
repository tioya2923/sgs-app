// GET /bootstrap — devolve ao frontend o conjunto de dados que o perfil pode ver,
// com a mesma forma do antigo `Database` do localStorage. O filtro é feito aqui,
// no servidor: dados a que o perfil não tem direito nunca saem da API.
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../db.js";
import { ACESSO, armazensLegiveis, nivelCasos, temPerfil, type Nivel } from "../domain/permissoes.js";
import type { Perfil } from "../domain/types.js";
import { serialize } from "../lib/serialize.js";
import { alertasDoPerfil, carregarDadosAlertas } from "../services/alertas.js";

type Linha = Record<string, unknown>;

function agregadoLimitado(a: Linha): Linha {
  // Sem morada, rendimento nem situação habitacional (dados de ação social).
  return { ...a, morada: "", situacaoHabitacional: "Outra", rendimentoTotal: 0 };
}

function pessoaLimitada(p: Linha, nivel: Nivel, perfil: Perfil): Linha {
  const base = {
    id: p["id"],
    agregadoId: p["agregadoId"],
    nome: p["nome"],
    dataNascimento: nivel === "composicao" ? p["dataNascimento"] : "1900-01-01",
    parentesco: nivel === "composicao" ? p["parentesco"] : "Outro",
    nacionalidade: "",
    estadoCivil: "Solteiro(a)",
    nif: "",
    documentoTipo: "Sem documento",
    documentoNumero: "",
    documentoValidade: null,
    // A cozinha precisa das restrições alimentares para preparar as refeições.
    restricoesAlimentares: perfil === "Cozinha" ? p["restricoesAlimentares"] : [],
    incapacidade: false,
    temProcessoProprio: false,
  };
  return base;
}

function processoLimitado(p: Linha): Linha {
  return {
    id: p["id"],
    numero: p["numero"],
    pessoaId: p["pessoaId"],
    estado: p["estado"],
    tecnicaReferencia: "",
    dataAbertura: "",
    periodicidadeReavaliacao: "Trimestral",
    proximaAvaliacao: "",
  };
}

export async function montarBootstrap(prisma: PrismaClient, user: { id: string; nome: string; perfil: Perfil }) {
  const { perfil } = user;
  const nivel = nivelCasos(perfil);
  const completo = nivel === "completo";

  const codigos = armazensLegiveis(perfil);
  const armazens = await prisma.armazem.findMany({ orderBy: { codigo: "asc" } });
  const idsArmazem = armazens.filter((a) => codigos.includes(a.codigo as never)).map((a) => a.id);

  const veStock = idsArmazem.length > 0;
  const veCabazes = temPerfil(perfil, ACESSO.cabazes);
  const veAgregados = completo || perfil === "Voluntário — distribuição" || perfil === "Armazém";
  const veRoupa = temPerfil(perfil, ACESSO.roupaEntregas);
  const veRefeicoes = temPerfil(perfil, ACESSO.refeicoes);
  const veCartoes = temPerfil(perfil, ACESSO.cartoes);
  const veMensagens = temPerfil(perfil, ACESSO.mensagens);

  const vazio = Promise.resolve([] as Linha[]);
  const [
    artigos, lotes, movimentos, modelosCabaz, agregados, pessoas, processos, contactos, documentos,
    inscricoes, atendimentos, entregasCabaz, entregasRoupa, refeicoesContagem, refeicoesPresenca,
    cartoes, mensagens, utilizadores, registosAcesso, dadosAlertas,
  ] = await Promise.all([
    veStock ? prisma.artigo.findMany({ where: { armazemId: { in: idsArmazem } }, orderBy: { nome: "asc" } }) : vazio,
    veStock ? prisma.lote.findMany({ where: { artigo: { armazemId: { in: idsArmazem } } } }) : vazio,
    veStock ? prisma.movimento.findMany({ where: { artigo: { armazemId: { in: idsArmazem } } }, orderBy: { criadoEm: "desc" }, take: 1000 }) : vazio,
    veCabazes ? prisma.modeloCabaz.findMany() : vazio,
    veAgregados ? prisma.agregado.findMany({ orderBy: { codigo: "asc" } }) : vazio,
    prisma.pessoa.findMany({ orderBy: { nome: "asc" } }),
    prisma.processo.findMany({ orderBy: { numero: "asc" } }),
    completo ? prisma.contacto.findMany() : vazio,
    completo ? prisma.documento.findMany() : vazio,
    completo ? prisma.inscricao.findMany() : vazio,
    completo ? prisma.atendimento.findMany({ orderBy: { data: "desc" } }) : vazio,
    veCabazes ? prisma.entregaCabaz.findMany({ orderBy: { dataPrevista: "desc" } }) : vazio,
    veRoupa ? prisma.entregaRoupa.findMany({ orderBy: { data: "desc" } }) : vazio,
    veRefeicoes ? prisma.refeicaoContagem.findMany({ orderBy: { data: "desc" } }) : vazio,
    veRefeicoes ? prisma.refeicaoPresenca.findMany() : vazio,
    veCartoes ? prisma.cartao.findMany({ orderBy: { carregadoEm: "desc" } }) : vazio,
    veMensagens ? prisma.mensagem.findMany({ orderBy: { agendada: "desc" } }) : vazio,
    perfil === "Direção"
      ? prisma.utilizador.findMany({ orderBy: { nome: "asc" } })
      : perfil === "Técnico de ação social"
        ? prisma.utilizador.findMany({ where: { perfil: "Técnico de ação social", ativo: true }, orderBy: { nome: "asc" } })
        : vazio,
    perfil === "Direção" ? prisma.registoAcesso.findMany({ orderBy: { dataHora: "desc" }, take: 200 }) : vazio,
    carregarDadosAlertas(prisma),
  ]);

  const pessoasVisiveis = (pessoas as Linha[]).map((p) => (completo ? p : pessoaLimitada(p, nivel, perfil)));
  const processosVisiveis = (processos as Linha[]).map((p) => (completo ? p : processoLimitado(p)));
  const agregadosVisiveis = (agregados as Linha[]).map((a) => (completo ? a : agregadoLimitado(a)));

  const dados = {
    armazens: armazens.filter((a) => codigos.includes(a.codigo as never)),
    artigos,
    lotes,
    movimentos,
    modelosCabaz,
    agregados: agregadosVisiveis,
    pessoas: veAgregados || veCabazes || veRefeicoes || veCartoes || veRoupa || veMensagens ? pessoasVisiveis : [],
    processos: processosVisiveis,
    contactos,
    documentos,
    inscricoes,
    atendimentos,
    entregasCabaz,
    entregasRoupa,
    refeicoesContagem,
    refeicoesPresenca,
    cartoes,
    mensagens,
    // Nunca sai passwordHash: só os campos públicos da conta.
    utilizadores: (utilizadores as Linha[]).map((u) => ({
      id: u["id"],
      nome: u["nome"],
      perfil: u["perfil"],
      email: perfil === "Direção" ? u["email"] : "",
      ativo: u["ativo"],
      ultimoAcesso: u["ultimoAcesso"] ?? null,
    })),
    registosAcesso,
    alertas: alertasDoPerfil(dadosAlertas, perfil),
  };
  return serialize(dados);
}

export async function bootstrapRoutes(app: FastifyInstance) {
  app.get("/bootstrap", { onRequest: app.authenticate }, async (request) => {
    return montarBootstrap(app.prisma, request.auth);
  });
}
