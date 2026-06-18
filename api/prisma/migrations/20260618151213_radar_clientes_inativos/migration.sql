-- CreateTable
CREATE TABLE "log_campanhas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "erro" TEXT,

    CONSTRAINT "log_campanhas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "log_campanhas" ADD CONSTRAINT "log_campanhas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
