-- CreateEnum
CREATE TYPE "StatusLembrete" AS ENUM ('entregue', 'falhou');

-- AlterTable
ALTER TABLE "agendamentos" ADD COLUMN     "lembrete_enviado_em" TIMESTAMP(3),
ADD COLUMN     "lembrete_status" "StatusLembrete";

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "lembretes_ativos" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mensagem_lembrete" TEXT;
