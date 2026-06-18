-- CreateEnum
CREATE TYPE "Plano" AS ENUM ('starter', 'pro', 'premium');
CREATE TYPE "StatusAgendamento" AS ENUM ('pendente', 'confirmado', 'cancelado');

-- CreateTable: tenants
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "telefone_whatsapp" TEXT NOT NULL,
    "twilio_account_sid" TEXT NOT NULL,
    "twilio_auth_token" TEXT NOT NULL,
    "google_calendar_id_dono" TEXT,
    "google_access_token" TEXT,
    "google_refresh_token" TEXT,
    "google_token_expiry" TIMESTAMP(3),
    "plano" "Plano" NOT NULL DEFAULT 'starter',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "senha_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateTable: profissionais
CREATE TABLE "profissionais" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone_whatsapp" TEXT,
    "google_calendar_id" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "profissionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable: servicos
CREATE TABLE "servicos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "duracao_minutos" INTEGER NOT NULL,
    "preco" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "servicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable: agendamentos
CREATE TABLE "agendamentos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "servico_id" TEXT NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cliente_telefone" TEXT NOT NULL,
    "data_hora" TIMESTAMP(3) NOT NULL,
    "status" "StatusAgendamento" NOT NULL DEFAULT 'pendente',
    "google_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sessoes_bot
CREATE TABLE "sessoes_bot" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cliente_telefone" TEXT NOT NULL,
    "etapa_atual" TEXT NOT NULL DEFAULT 'INICIO',
    "dados_coletados" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sessoes_bot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sessoes_bot_tenant_id_cliente_telefone_key"
    ON "sessoes_bot"("tenant_id", "cliente_telefone");

-- Foreign Keys
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "servicos" ADD CONSTRAINT "servicos_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_profissional_id_fkey"
    FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_servico_id_fkey"
    FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sessoes_bot" ADD CONSTRAINT "sessoes_bot_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
