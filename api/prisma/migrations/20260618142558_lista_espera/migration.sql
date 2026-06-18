-- CreateEnum
CREATE TYPE "StatusListaEspera" AS ENUM ('aguardando', 'notificado', 'convertido', 'expirado');

-- CreateTable
CREATE TABLE "lista_espera" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "profissional_id" TEXT,
    "servico_id" TEXT NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cliente_telefone" TEXT NOT NULL,
    "data_desejada" TIMESTAMP(3) NOT NULL,
    "status" "StatusListaEspera" NOT NULL DEFAULT 'aguardando',
    "notificado_em" TIMESTAMP(3),
    "expira_em" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lista_espera_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
