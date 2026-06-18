-- CreateEnum
CREATE TYPE "RoleUsuario" AS ENUM ('dono', 'gerente', 'recepcionista', 'barbeiro');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "profissional_id" TEXT,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "role" "RoleUsuario" NOT NULL DEFAULT 'barbeiro',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "invite_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_tenant_id_email_key" ON "usuarios"("tenant_id", "email");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE SET NULL ON UPDATE CASCADE;
