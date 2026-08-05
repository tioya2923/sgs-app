// Modelo de dados — Sistema de Gestão Social
// Centro Social Paroquial de São Nicolau, Baixa de Lisboa
// Corresponde à secção 3 do esquema v0.2

export type ID = string;

export type SituacaoHabitacional =
  | "Arrendada"
  | "Própria"
  | "Cedida"
  | "Ocupação"
  | "Sem-abrigo"
  | "Outra";

export type EstadoCivil =
  | "Solteiro(a)"
  | "Casado(a)"
  | "União de facto"
  | "Divorciado(a)"
  | "Viúvo(a)";

export type Parentesco =
  | "Titular"
  | "Cônjuge"
  | "Filho(a)"
  | "Neto(a)"
  | "Pai/Mãe"
  | "Outro";

export interface Agregado {
  id: ID;
  codigo: string; // AG-014
  morada: string;
  freguesia: string;
  situacaoHabitacional: SituacaoHabitacional;
  rendimentoTotal: number;
  numPessoas: number;
  numMenores: number;
  dataAbertura: string; // ISO date
}

export interface Pessoa {
  id: ID;
  agregadoId: ID;
  nome: string;
  dataNascimento: string;
  nacionalidade: string;
  estadoCivil: EstadoCivil;
  nif: string;
  documentoTipo: "Cartão de Cidadão" | "Título de Residência" | "Passaporte" | "Sem documento";
  documentoNumero: string;
  documentoValidade: string | null;
  parentesco: Parentesco;
  restricoesAlimentares: string[];
  incapacidade: boolean;
  temProcessoProprio: boolean;
}

export type EstadoProcesso = "Ativo" | "Suspenso" | "Encerrado";
export type Periodicidade = "Mensal" | "Trimestral" | "Semestral";

export interface Processo {
  id: ID;
  numero: number; // 007
  pessoaId: ID;
  tecnicaReferencia: string;
  dataAbertura: string;
  estado: EstadoProcesso;
  periodicidadeReavaliacao: Periodicidade;
  proximaAvaliacao: string;
}

export type TipoContacto = "Telemóvel" | "Telefone fixo" | "Email";

export interface Contacto {
  id: ID;
  pessoaId: ID;
  tipo: TipoContacto;
  valor: string;
  consentimento: boolean;
  dataConsentimento: string | null;
  preferencial: boolean;
}

export interface Documento {
  id: ID;
  processoId: ID;
  tipo: string;
  ficheiro: string;
  data: string;
  validade: string | null;
}

export type Programa =
  | "Banco Solidário de Alimentos"
  | "Casa da Caridade"
  | "Banco Solidário de Roupa"
  | "Mais Sós"
  | "Convívio"
  | "Conferência de São Vicente de Paulo";

export type EstadoInscricao = "Ativa" | "Suspensa" | "Terminada";

export interface Inscricao {
  id: ID;
  processoId: ID;
  programa: Programa;
  data: string;
  estado: EstadoInscricao;
  motivo: string;
  observacoes: string;
}

export interface Atendimento {
  id: ID;
  processoId: ID;
  data: string;
  tipo: "Primeira consulta" | "Acompanhamento" | "Reavaliação" | "Emergência";
  motivo: string;
  observacoes: string;
  necessidadesDetetadas: string[];
  encaminhamento: string;
  proximaAvaliacao: string | null;
  tecnico: string;
}

// --- Os quatro armazéns -----------------------------------------------

export type ArmazemCodigo = "BSA" | "RES" | "CDC" | "BSR";

export interface Armazem {
  id: ID;
  codigo: ArmazemCodigo;
  designacao: string;
}

export interface Artigo {
  id: ID;
  nome: string;
  categoria: string;
  unidade: string;
  armazemId: ID;
  stockMinimo: number;
  consumivel: boolean;
}

export type EstadoLote = "disponível" | "reservado" | "fora de uso";

export interface Lote {
  id: ID;
  artigoId: ID;
  quantidade: number;
  validade: string | null;
  localizacaoFisica: string;
  estado: EstadoLote;
  entrada: string;
}

export type TipoMovimento = "entrada" | "saída" | "transferência" | "quebra";

export interface Movimento {
  id: ID;
  artigoId: ID;
  loteId: ID | null;
  tipo: TipoMovimento;
  quantidade: number;
  data: string;
  origemOuDestino: string;
  fornecedor: string | null;
  benfeitor: string | null;
  documento: string | null;
  preco: number | null;
  registadoPor: string;
  referencia: string | null;
}

// --- Distribuição --------------------------------------------------------

export interface LinhaModeloCabaz {
  artigoId: ID;
  quantidade: number;
}

export interface ModeloCabaz {
  id: ID;
  nome: string;
  tipologia: string;
  versao: number;
  ativo: boolean;
  linhas: LinhaModeloCabaz[];
}

export type TipoCabaz = "Semanal" | "Mensal" | "Ocasional" | "Natal" | "Páscoa";
export type EstadoEntregaCabaz = "Prevista" | "Entregue" | "Cancelada" | "Em falta";

export interface EntregaCabaz {
  id: ID;
  agregadoId: ID;
  processoId: ID;
  tipo: TipoCabaz;
  modeloId: ID;
  modeloVersao: number;
  dataPrevista: string;
  dataEfetiva: string | null;
  levantadoPor: string | null;
  registadoPor: string;
  estado: EstadoEntregaCabaz;
  observacoes: string;
  linhas: LinhaModeloCabaz[];
}

export interface ItemRoupa {
  tipo: string;
  tamanho: string;
  quantidade: number;
  estado: "Novo" | "Bom estado" | "Usado";
}

export interface EntregaRoupa {
  id: ID;
  processoId: ID;
  data: string;
  artigos: ItemRoupa[];
  registadoPor: string;
}

export type Turno = "Almoço" | "Jantar";

export interface RefeicaoContagem {
  id: ID;
  data: string;
  turno: Turno;
  numPessoas: number;
  sopas: number;
  pratos: number;
  alternativaVegetariana: number;
  sobremesas: number;
  pao: number;
  aguas: number;
  takeaway: number;
}

export interface RefeicaoPresenca {
  id: ID;
  data: string;
  turno: Turno;
  processoId: ID;
  modalidade: "Presencial" | "Take-away";
  numDoses: number;
}

export type EstadoCartao = "Ativo" | "Por entregar" | "Expirado" | "Cancelado";

export interface Cartao {
  id: ID;
  numero: string;
  agregadoId: ID;
  processoId: ID;
  valor: number;
  origemFundo: string;
  carregadoEm: string;
  validade: string;
  entregueEm: string | null;
  recebidoPor: string | null;
  provaRececao: boolean;
  emitidoPor: string;
  estado: EstadoCartao;
}

// --- Comunicação e auditoria ---------------------------------------------

export type TipoAlerta =
  | "Validade curta"
  | "Stock abaixo do mínimo"
  | "Produto esgotado"
  | "Pessoa sem reavaliação"
  | "Documento caducado"
  | "Inscrição a renovar"
  | "Aniversário"
  | "Ausência prolongada"
  | "Cartão a expirar";

export type Gravidade = "Informação" | "Atenção" | "Urgente";
export type EstadoAlerta = "Ativo" | "Tratado" | "Adiado";

export interface Alerta {
  id: ID;
  tipo: TipoAlerta;
  gravidade: Gravidade;
  entidade: string; // nome legível da entidade relacionada
  entidadeTipo: string;
  entidadeId: ID | null;
  geradoEm: string;
  estado: EstadoAlerta;
  motivoAdiamento: string | null;
  tratadoPor: string | null;
}

export type CanalMensagem = "SMS" | "Email";
export type EstadoEntregaMensagem =
  | "Agendada"
  | "Enviada"
  | "Entregue"
  | "Falhou"
  | "Sem consentimento";

export interface Mensagem {
  id: ID;
  processoId: ID;
  canal: CanalMensagem;
  modelo: string;
  conteudoFinal: string;
  agendada: string;
  enviada: string | null;
  estadoEntrega: EstadoEntregaMensagem;
  resposta: string | null;
  custo: number | null;
}

export interface RegistoAcesso {
  id: ID;
  utilizador: string;
  acao: string;
  entidade: string;
  dataHora: string;
}

export type Perfil =
  | "Direção"
  | "Técnico de ação social"
  | "Voluntário — distribuição"
  | "Cozinha"
  | "Armazém"
  | "Administrativo";

export interface Utilizador {
  id: ID;
  nome: string;
  perfil: Perfil;
  email: string;
  password: string;
  ativo: boolean;
  ultimoAcesso: string | null;
}

export interface Database {
  agregados: Agregado[];
  pessoas: Pessoa[];
  processos: Processo[];
  contactos: Contacto[];
  documentos: Documento[];
  inscricoes: Inscricao[];
  atendimentos: Atendimento[];
  armazens: Armazem[];
  artigos: Artigo[];
  lotes: Lote[];
  movimentos: Movimento[];
  modelosCabaz: ModeloCabaz[];
  entregasCabaz: EntregaCabaz[];
  entregasRoupa: EntregaRoupa[];
  refeicoesContagem: RefeicaoContagem[];
  refeicoesPresenca: RefeicaoPresenca[];
  cartoes: Cartao[];
  alertas: Alerta[];
  mensagens: Mensagem[];
  registosAcesso: RegistoAcesso[];
  utilizadores: Utilizador[];
}
