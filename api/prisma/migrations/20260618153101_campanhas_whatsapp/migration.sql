-- CreateEnum
CREATE TYPE "SegmentoCampanha" AS ENUM ('todos', 'inativos_30', 'inativos_60', 'aniversariantes_mes', 'vip');

-- CreateEnum
CREATE TYPE "StatusCampanha" AS ENUM ('rascunho', 'agendada', 'enviando', 'concluida', 'falhou');

-- AlterTable
ALTER TABLE "log_campanhas" ADD COLUMN     "campanha_id" TEXT;

-- CreateTable
CREATE TABLE "campanhas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "segmento" "SegmentoCampanha" NOT NULL,
    "mensagem" TEXT NOT NULL,
    "agendado_para" TIMESTAMP(3),
    "enviado_em" TIMESTAMP(3),
    "status" "StatusCampanha" NOT NULL DEFAULT 'rascunho',
    "total_enviados" INTEGER NOT NULL DEFAULT 0,
    "total_falhas" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_campanhas" ADD CONSTRAINT "log_campanhas_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
