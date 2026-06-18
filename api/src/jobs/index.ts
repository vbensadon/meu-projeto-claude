import cron from "node-cron";
import { processarFilaEspera } from "../services/listaEsperaService";
import { processarLembretes } from "../services/lembreteService";
import { prisma } from "../lib/prisma";
import { executarCampanha } from "../services/campanhaService";

async function processarCampanhasAgendadas(): Promise<void> {
  const agora = new Date();
  const campanhas = await prisma.campanha.findMany({
    where: { status: "agendada", agendado_para: { lte: agora } },
    select: { id: true },
  });
  for (const { id } of campanhas) {
    executarCampanha(id).catch((err) => {
      console.error(`[Jobs] Erro ao executar campanha ${id}:`, err);
    });
  }
}

export function iniciarJobs(): void {
  cron.schedule("*/15 * * * *", () => {
    processarFilaEspera().catch((err) => {
      console.error("[Jobs] Erro ao processar fila de espera:", err);
    });
  });

  cron.schedule("0 * * * *", () => {
    processarLembretes().catch((err) => {
      console.error("[Jobs] Erro ao processar lembretes:", err);
    });
  });

  cron.schedule("* * * * *", () => {
    processarCampanhasAgendadas().catch((err) => {
      console.error("[Jobs] Erro ao processar campanhas agendadas:", err);
    });
  });
}
