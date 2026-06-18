-- CreateTable
CREATE TABLE "bloqueios" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "recorrencia" TEXT,
    "serie_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloqueios_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
