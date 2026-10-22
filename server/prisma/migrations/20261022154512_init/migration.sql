-- CreateTable
CREATE TABLE "utilizadores" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_acesso" TIMESTAMPTZ,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilizadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "utilizador_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registos_acesso" (
    "id" UUID NOT NULL,
    "utilizador" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "data_hora" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registos_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agregados" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "morada" TEXT NOT NULL,
    "freguesia" TEXT NOT NULL,
    "situacao_habitacional" TEXT NOT NULL,
    "rendimento_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "num_pessoas" INTEGER NOT NULL DEFAULT 0,
    "num_menores" INTEGER NOT NULL DEFAULT 0,
    "data_abertura" TEXT NOT NULL,

    CONSTRAINT "agregados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoas" (
    "id" UUID NOT NULL,
    "agregado_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "data_nascimento" TEXT NOT NULL,
    "nacionalidade" TEXT NOT NULL,
    "estado_civil" TEXT NOT NULL,
    "nif" TEXT NOT NULL DEFAULT '',
    "documento_tipo" TEXT NOT NULL,
    "documento_numero" TEXT NOT NULL DEFAULT '',
    "documento_validade" TEXT,
    "parentesco" TEXT NOT NULL,
    "restricoes_alimentares" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "incapacidade" BOOLEAN NOT NULL DEFAULT false,
    "tem_processo_proprio" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pessoas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processos" (
    "id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "tecnica_referencia" TEXT NOT NULL,
    "data_abertura" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "periodicidade_reavaliacao" TEXT NOT NULL,
    "proxima_avaliacao" TEXT NOT NULL,

    CONSTRAINT "processos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactos" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "consentimento" BOOLEAN NOT NULL,
    "data_consentimento" TEXT,
    "preferencial" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contactos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" UUID NOT NULL,
    "processo_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "ficheiro" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "validade" TEXT,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscricoes" (
    "id" UUID NOT NULL,
    "processo_id" UUID NOT NULL,
    "programa" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT '',
    "observacoes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "inscricoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atendimentos" (
    "id" UUID NOT NULL,
    "processo_id" UUID NOT NULL,
    "data" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "observacoes" TEXT NOT NULL DEFAULT '',
    "necessidades_detetadas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "encaminhamento" TEXT NOT NULL DEFAULT '',
    "proxima_avaliacao" TEXT,
    "tecnico" TEXT NOT NULL,

    CONSTRAINT "atendimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armazens" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,

    CONSTRAINT "armazens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artigos" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "armazem_id" UUID NOT NULL,
    "stock_minimo" INTEGER NOT NULL DEFAULT 0,
    "consumivel" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "artigos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes" (
    "id" UUID NOT NULL,
    "artigo_id" UUID NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "validade" TEXT,
    "localizacao_fisica" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "entrada" TEXT NOT NULL,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos" (
    "id" UUID NOT NULL,
    "artigo_id" UUID NOT NULL,
    "lote_id" UUID,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "origem_ou_destino" TEXT NOT NULL,
    "fornecedor" TEXT,
    "benfeitor" TEXT,
    "documento" TEXT,
    "preco" DECIMAL(10,2),
    "registado_por" TEXT NOT NULL,
    "referencia" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_cabaz" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipologia" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "linhas" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "modelos_cabaz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas_cabaz" (
    "id" UUID NOT NULL,
    "agregado_id" UUID,
    "processo_id" UUID,
    "tipo" TEXT NOT NULL,
    "modelo_id" UUID,
    "modelo_versao" INTEGER NOT NULL,
    "data_prevista" TEXT NOT NULL,
    "data_efetiva" TEXT,
    "levantado_por" TEXT,
    "registado_por" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "observacoes" TEXT NOT NULL DEFAULT '',
    "linhas" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "entregas_cabaz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas_roupa" (
    "id" UUID NOT NULL,
    "processo_id" UUID,
    "data" TEXT NOT NULL,
    "artigos" JSONB NOT NULL DEFAULT '[]',
    "registado_por" TEXT NOT NULL,

    CONSTRAINT "entregas_roupa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refeicoes_contagem" (
    "id" UUID NOT NULL,
    "data" TEXT NOT NULL,
    "turno" TEXT NOT NULL,
    "num_pessoas" INTEGER NOT NULL,
    "sopas" INTEGER NOT NULL,
    "pratos" INTEGER NOT NULL,
    "sobremesas" INTEGER NOT NULL,
    "pao" INTEGER NOT NULL,
    "aguas" INTEGER NOT NULL,

    CONSTRAINT "refeicoes_contagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refeicoes_presenca" (
    "id" UUID NOT NULL,
    "data" TEXT NOT NULL,
    "turno" TEXT NOT NULL,
    "processo_id" UUID,
    "modalidade" TEXT NOT NULL,
    "num_doses" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "refeicoes_presenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cartoes" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "agregado_id" UUID,
    "processo_id" UUID,
    "valor" DECIMAL(10,2) NOT NULL,
    "origem_fundo" TEXT NOT NULL,
    "carregado_em" TEXT NOT NULL,
    "validade" TEXT NOT NULL,
    "entregue_em" TEXT,
    "recebido_por" TEXT,
    "prova_rececao" BOOLEAN NOT NULL DEFAULT false,
    "emitido_por" TEXT NOT NULL,
    "estado" TEXT NOT NULL,

    CONSTRAINT "cartoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "gravidade" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_tipo" TEXT NOT NULL,
    "entidade_id" TEXT,
    "gerado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL,
    "motivo_adiamento" TEXT,
    "tratado_por" TEXT,

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" UUID NOT NULL,
    "processo_id" UUID,
    "canal" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "conteudo_final" TEXT NOT NULL,
    "agendada" TIMESTAMPTZ NOT NULL,
    "enviada" TIMESTAMPTZ,
    "estado_entrega" TEXT NOT NULL,
    "resposta" TEXT,
    "custo" DECIMAL(6,2),

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilizadores_email_key" ON "utilizadores"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_utilizador_id_idx" ON "refresh_tokens"("utilizador_id");

-- CreateIndex
CREATE INDEX "registos_acesso_data_hora_idx" ON "registos_acesso"("data_hora");

-- CreateIndex
CREATE UNIQUE INDEX "agregados_codigo_key" ON "agregados"("codigo");

-- CreateIndex
CREATE INDEX "pessoas_agregado_id_idx" ON "pessoas"("agregado_id");

-- CreateIndex
CREATE UNIQUE INDEX "processos_numero_key" ON "processos"("numero");

-- CreateIndex
CREATE INDEX "processos_pessoa_id_idx" ON "processos"("pessoa_id");

-- CreateIndex
CREATE INDEX "contactos_pessoa_id_idx" ON "contactos"("pessoa_id");

-- CreateIndex
CREATE INDEX "documentos_processo_id_idx" ON "documentos"("processo_id");

-- CreateIndex
CREATE INDEX "inscricoes_processo_id_idx" ON "inscricoes"("processo_id");

-- CreateIndex
CREATE INDEX "atendimentos_processo_id_idx" ON "atendimentos"("processo_id");

-- CreateIndex
CREATE UNIQUE INDEX "armazens_codigo_key" ON "armazens"("codigo");

-- CreateIndex
CREATE INDEX "artigos_armazem_id_idx" ON "artigos"("armazem_id");

-- CreateIndex
CREATE INDEX "lotes_artigo_id_idx" ON "lotes"("artigo_id");

-- CreateIndex
CREATE INDEX "movimentos_artigo_id_idx" ON "movimentos"("artigo_id");

-- CreateIndex
CREATE INDEX "movimentos_data_idx" ON "movimentos"("data");

-- CreateIndex
CREATE INDEX "entregas_cabaz_agregado_id_idx" ON "entregas_cabaz"("agregado_id");

-- CreateIndex
CREATE INDEX "entregas_cabaz_data_prevista_idx" ON "entregas_cabaz"("data_prevista");

-- CreateIndex
CREATE UNIQUE INDEX "refeicoes_contagem_data_turno_key" ON "refeicoes_contagem"("data", "turno");

-- CreateIndex
CREATE UNIQUE INDEX "refeicoes_presenca_data_turno_processo_id_key" ON "refeicoes_presenca"("data", "turno", "processo_id");

-- CreateIndex
CREATE UNIQUE INDEX "cartoes_numero_key" ON "cartoes"("numero");

-- CreateIndex
CREATE INDEX "mensagens_agendada_idx" ON "mensagens"("agendada");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_utilizador_id_fkey" FOREIGN KEY ("utilizador_id") REFERENCES "utilizadores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_agregado_id_fkey" FOREIGN KEY ("agregado_id") REFERENCES "agregados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processos" ADD CONSTRAINT "processos_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscricoes" ADD CONSTRAINT "inscricoes_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artigos" ADD CONSTRAINT "artigos_armazem_id_fkey" FOREIGN KEY ("armazem_id") REFERENCES "armazens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos" ADD CONSTRAINT "movimentos_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos" ADD CONSTRAINT "movimentos_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_cabaz" ADD CONSTRAINT "entregas_cabaz_agregado_id_fkey" FOREIGN KEY ("agregado_id") REFERENCES "agregados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_cabaz" ADD CONSTRAINT "entregas_cabaz_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_roupa" ADD CONSTRAINT "entregas_roupa_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refeicoes_presenca" ADD CONSTRAINT "refeicoes_presenca_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartoes" ADD CONSTRAINT "cartoes_agregado_id_fkey" FOREIGN KEY ("agregado_id") REFERENCES "agregados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartoes" ADD CONSTRAINT "cartoes_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integridade que o Prisma não expressa no schema
-- ---------------------------------------------------------------------------

-- Stock nunca negativo; movimentos sempre com quantidade positiva.
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_quantidade_nao_negativa" CHECK ("quantidade" >= 0);
ALTER TABLE "artigos" ADD CONSTRAINT "artigos_stock_minimo_nao_negativo" CHECK ("stock_minimo" >= 0);
ALTER TABLE "movimentos" ADD CONSTRAINT "movimentos_quantidade_positiva" CHECK ("quantidade" > 0);

-- Um artigo por nome em cada armazém (sem distinguir maiúsculas nem espaços nas pontas).
CREATE UNIQUE INDEX "artigos_armazem_nome_key" ON "artigos" ("armazem_id", lower(btrim("nome")));

-- E-mails únicos sem distinguir maiúsculas.
CREATE UNIQUE INDEX "utilizadores_email_lower_key" ON "utilizadores" (lower("email"));

-- Datas de calendário guardadas como texto AAAA-MM-DD: garantir o formato.
DO $$
DECLARE
  par text[];
  pares text[][] := ARRAY[
    ['agregados','data_abertura'],
    ['pessoas','data_nascimento'],['pessoas','documento_validade'],
    ['processos','data_abertura'],['processos','proxima_avaliacao'],
    ['contactos','data_consentimento'],
    ['documentos','data'],['documentos','validade'],
    ['inscricoes','data'],
    ['atendimentos','data'],['atendimentos','proxima_avaliacao'],
    ['lotes','validade'],['lotes','entrada'],
    ['movimentos','data'],
    ['entregas_cabaz','data_prevista'],['entregas_cabaz','data_efetiva'],
    ['entregas_roupa','data'],
    ['refeicoes_contagem','data'],['refeicoes_presenca','data'],
    ['cartoes','carregado_em'],['cartoes','validade'],['cartoes','entregue_em']
  ];
BEGIN
  FOREACH par SLICE 1 IN ARRAY pares LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I IS NULL OR %I ~ ''^\d{4}-\d{2}-\d{2}$'')',
      par[1], par[1] || '_' || par[2] || '_formato', par[2], par[2]);
  END LOOP;
END $$;
