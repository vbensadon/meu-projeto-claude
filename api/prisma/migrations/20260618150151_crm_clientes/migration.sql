-- CreateEnum
CREATE TYPE "FonteCliente" AS ENUM ('whatsapp', 'manual', 'presencial');

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "notas" TEXT,
    "preferencias" TEXT,
    "aniversario" TIMESTAMP(3),
    "fonte" "FonteCliente" NOT NULL DEFAULT 'whatsapp',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tenant_id_telefone_key" ON "clientes"("tenant_id", "telefone");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
