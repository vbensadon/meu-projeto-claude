-- AlterTable
ALTER TABLE "profissionais" ADD COLUMN     "comissao_percentual" DECIMAL(5,2) NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "comissoes_pagamentos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "periodo_inicio" TIMESTAMP(3) NOT NULL,
    "periodo_fim" TIMESTAMP(3) NOT NULL,
    "receita_base" DECIMAL(10,2) NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "valor_pago" DECIMAL(10,2) NOT NULL,
    "pago_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comissoes_pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comissoes_pagamentos_profissional_id_periodo_inicio_periodo_key" ON "comissoes_pagamentos"("profissional_id", "periodo_inicio", "periodo_fim");

-- AddForeignKey
ALTER TABLE "comissoes_pagamentos" ADD CONSTRAINT "comissoes_pagamentos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes_pagamentos" ADD CONSTRAINT "comissoes_pagamentos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
