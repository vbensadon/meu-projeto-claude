-- CreateEnum
CREATE TYPE "TipoComissao" AS ENUM ('percentual', 'fixo');

-- CreateTable
CREATE TABLE "regras_comissao" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "servico_id" TEXT,
    "tipo" "TipoComissao" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regras_comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos_comissao" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "agendamento_id" TEXT NOT NULL,
    "regra_id" TEXT,
    "valor_bruto" DECIMAL(10,2) NOT NULL,
    "comissao_percentual" DECIMAL(5,2) NOT NULL,
    "comissao_valor" DECIMAL(10,2) NOT NULL,
    "pago_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lancamentos_comissao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_comissao_agendamento_id_key" ON "lancamentos_comissao"("agendamento_id");

-- AddForeignKey
ALTER TABLE "regras_comissao" ADD CONSTRAINT "regras_comissao_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_comissao" ADD CONSTRAINT "regras_comissao_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_comissao" ADD CONSTRAINT "regras_comissao_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_comissao" ADD CONSTRAINT "lancamentos_comissao_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_comissao" ADD CONSTRAINT "lancamentos_comissao_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_comissao" ADD CONSTRAINT "lancamentos_comissao_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_comissao" ADD CONSTRAINT "lancamentos_comissao_regra_id_fkey" FOREIGN KEY ("regra_id") REFERENCES "regras_comissao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
