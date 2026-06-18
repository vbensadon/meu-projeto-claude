-- CreateEnum
CREATE TYPE "StatusTemplate" AS ENUM ('pendente', 'aprovado', 'rejeitado');

-- CreateEnum
CREATE TYPE "EtapaConversa" AS ENUM ('BOAS_VINDAS', 'ESCOLHA_SERVICO', 'ESCOLHA_PROFISSIONAL', 'ESCOLHA_DATA', 'ESCOLHA_HORARIO', 'FILA_ESPERA_PROMPT', 'CONFIRMACAO_AGENDAMENTO', 'LEMBRETE', 'VAGA_FILA_ESPERA');

-- CreateEnum
CREATE TYPE "FormatoMensagem" AS ENUM ('AUTOMATICO', 'QUICK_REPLY', 'LISTA', 'TEXTO');

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "content_sid" TEXT NOT NULL,
    "status" "StatusTemplate" NOT NULL DEFAULT 'pendente',
    "variaveis" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interactive_message_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "etapa" "EtapaConversa" NOT NULL,
    "corpo_texto" TEXT NOT NULL,
    "formato" "FormatoMensagem" NOT NULL DEFAULT 'AUTOMATICO',
    "labels_botoes" JSONB NOT NULL DEFAULT '[]',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interactive_message_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_tenant_id_chave_key" ON "whatsapp_templates"("tenant_id", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "interactive_message_configs_tenant_id_etapa_key" ON "interactive_message_configs"("tenant_id", "etapa");

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactive_message_configs" ADD CONSTRAINT "interactive_message_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
