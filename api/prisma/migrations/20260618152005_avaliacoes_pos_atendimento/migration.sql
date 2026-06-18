-- CreateTable
CREATE TABLE "avaliacoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "agendamento_id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_agendamento_id_key" ON "avaliacoes"("agendamento_id");

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
