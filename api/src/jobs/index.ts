import cron from "node-cron";
import { processarFilaEspera } from "../services/listaEsperaService";
import { processarLembretes } from "../services/lembreteService";
import { prisma } from "../lib/prisma";
import { executarCampanha } from "../services/campanhaService";
import { createOrUpdateAlert } from "../platform/services/alertService";
import { markAbandonedConversations } from "../platform/services/conversationService";

// ── Jobs de negócio ───────────────────────────────────────────────────────────

async function verificarTokensExpirados(): Promise<void> {
  const agora = new Date();
  const limite = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
  const tenants = await prisma.tenant.findMany({
    where: {
      calendarStatus: "CONNECTED",
      google_token_expiry: { lte: limite },
    },
    select: { id: true, nome: true, google_token_expiry: true },
  });

  for (const tenant of tenants) {
    const expirado =
      tenant.google_token_expiry !== null && tenant.google_token_expiry < agora;
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { calendarStatus: expirado ? "EXPIRED" : "CONNECTED" },
    });
    if (expirado) {
      await createOrUpdateAlert({
        tenantId: tenant.id,
        type: "CALENDAR_TOKEN_EXPIRED",
        severity: "WARNING",
        title: `Token Google Calendar expirado — ${tenant.nome}`,
        description:
          "O token do Google Calendar expirou. O tenant precisa reconectar para continuar sincronizando agendamentos.",
      }).catch(console.error);
    }
    console.log(
      `[Jobs] Google Calendar ${expirado ? "expirado" : "expirando em breve"} para: ${tenant.nome}`
    );
  }
}

async function verificarSubscricoesVencidas(): Promise<void> {
  const agora = new Date();
  await prisma.subscription.updateMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lte: agora } },
    data: { status: "PAST_DUE" },
  });
  await prisma.subscription.updateMany({
    where: { status: "TRIAL", trialEndsAt: { lte: agora } },
    data: { status: "PAST_DUE" },
  });
}

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

// ── Jobs de monitoramento de alertas ─────────────────────────────────────────

async function detectarFalhasWebhook(): Promise<void> {
  const janela = new Date();
  janela.setMinutes(janela.getMinutes() - 30); // janela de 30 min
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);

  const metricas = await prisma.usageMetric.findMany({
    where: { date: hoje, webhookErrors: { gte: 5 } },
    select: { tenantId: true, webhookErrors: true },
  });

  for (const m of metricas) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: m.tenantId },
      select: { nome: true, status: true },
    });
    if (!tenant || tenant.status === "SUSPENDED" || tenant.status === "CANCELLED") continue;

    await createOrUpdateAlert({
      tenantId: m.tenantId,
      type: "WEBHOOK_FAILURES",
      severity: m.webhookErrors >= 20 ? "CRITICAL" : "WARNING",
      title: `Falhas de webhook — ${tenant.nome}`,
      description: `${m.webhookErrors} erros de webhook registrados hoje. Pode indicar token Twilio inválido ou falha no processamento de mensagens.`,
      metadata: { webhookErrors: m.webhookErrors },
    }).catch(console.error);
  }
}

async function detectarLimiteMensagens(): Promise<void> {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  // Agrupa mensagens por tenant no mês
  const grupos = await prisma.usageMetric.groupBy({
    by: ["tenantId"],
    where: { date: { gte: inicioMes } },
    _sum: { messagesProcessed: true },
  });

  for (const g of grupos) {
    const totalMes = g._sum.messagesProcessed ?? 0;
    const sub = await prisma.subscription.findUnique({
      where: { tenantId: g.tenantId },
      include: { plan: { select: { maxMessages: true, name: true } } },
    });
    if (!sub) continue;

    const limite = sub.plan.maxMessages;
    const pct = totalMes / limite;
    if (pct < 0.8) continue;

    const tenant = await prisma.tenant.findUnique({
      where: { id: g.tenantId },
      select: { nome: true },
    });
    if (!tenant) continue;

    await createOrUpdateAlert({
      tenantId: g.tenantId,
      type: "MESSAGE_LIMIT_REACHED",
      severity: pct >= 1 ? "CRITICAL" : "WARNING",
      title: `${pct >= 1 ? "Limite de mensagens atingido" : "Mensagens próximas do limite"} — ${tenant.nome}`,
      description: `Plano ${sub.plan.name}: ${totalMes.toLocaleString()} de ${limite.toLocaleString()} mensagens usadas este mês (${Math.round(pct * 100)}%).`,
      metadata: { used: totalMes, limit: limite, pct: Math.round(pct * 100) },
    }).catch(console.error);
  }
}

async function detectarInatividadeBot(): Promise<void> {
  const agora = new Date();
  const hora = agora.getHours(); // hora local UTC
  // Só verificar durante horário comercial (8-20)
  if (hora < 8 || hora >= 20) return;

  const limiteInatividade = new Date(agora.getTime() - 4 * 60 * 60 * 1000); // 4h sem mensagem

  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE", ativo: true },
    select: { id: true, nome: true },
  });

  for (const tenant of tenants) {
    // Verifica última sessão bot
    const ultimaSessao = await prisma.sessaoBot.findFirst({
      where: { tenant_id: tenant.id },
      orderBy: { ultima_mensagem_em: "desc" },
      select: { ultima_mensagem_em: true },
    });

    // Se nunca houve sessão ou houve sessão recente, ignorar
    if (!ultimaSessao?.ultima_mensagem_em) continue;
    if (ultimaSessao.ultima_mensagem_em > limiteInatividade) continue;

    // Checa se teve pelo menos 1 mensagem nas últimas 48h (só alertar se o bot estava ativo antes)
    const ultimas48h = new Date(agora.getTime() - 48 * 60 * 60 * 1000);
    if (ultimaSessao.ultima_mensagem_em < ultimas48h) continue;

    await createOrUpdateAlert({
      tenantId: tenant.id,
      type: "BOT_INACTIVITY",
      severity: "WARNING",
      title: `Bot sem atividade — ${tenant.nome}`,
      description: `Nenhuma mensagem processada nas últimas 4 horas durante horário comercial. Última atividade: ${ultimaSessao.ultima_mensagem_em.toLocaleString("pt-BR")}.`,
      metadata: { lastActivity: ultimaSessao.ultima_mensagem_em },
    }).catch(console.error);
  }
}

async function limparWebhookEventsAntigos(): Promise<void> {
  const agora = new Date();
  const cutoffProcessados = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);  // 30 dias
  const cutoffFalhos = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);      // 90 dias

  const [processados, falhos] = await Promise.all([
    prisma.webhookEvent.deleteMany({
      where: { status: "PROCESSED", createdAt: { lt: cutoffProcessados } },
    }),
    prisma.webhookEvent.deleteMany({
      where: { status: "FAILED", createdAt: { lt: cutoffFalhos } },
    }),
  ]);

  if (processados.count + falhos.count > 0) {
    console.log(`[Jobs] Limpeza webhook events: ${processados.count} processados + ${falhos.count} falhos removidos`);
  }
}

// ── Inicialização ─────────────────────────────────────────────────────────────

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

  // Diariamente às 7h: tokens Google Calendar + alertas de calendário
  cron.schedule("0 7 * * *", () => {
    verificarTokensExpirados().catch((err) => {
      console.error("[Jobs] Erro ao verificar tokens expirados:", err);
    });
  });

  // Diariamente às 8h: subscriptions vencidas
  cron.schedule("0 8 * * *", () => {
    verificarSubscricoesVencidas().catch((err) => {
      console.error("[Jobs] Erro ao verificar subscriptions vencidas:", err);
    });
  });

  // A cada 10 min: falhas de webhook
  cron.schedule("*/10 * * * *", () => {
    detectarFalhasWebhook().catch((err) => {
      console.error("[Jobs] Erro ao detectar falhas de webhook:", err);
    });
  });

  // Diariamente às 9h: limite de mensagens do plano
  cron.schedule("0 9 * * *", () => {
    detectarLimiteMensagens().catch((err) => {
      console.error("[Jobs] Erro ao detectar limite de mensagens:", err);
    });
  });

  // A cada hora: inatividade do bot (somente horário comercial)
  cron.schedule("0 * * * *", () => {
    detectarInatividadeBot().catch((err) => {
      console.error("[Jobs] Erro ao detectar inatividade do bot:", err);
    });
  });

  // A cada hora: marcar conversas abandonadas (sem atividade há 4h)
  cron.schedule("30 * * * *", () => {
    markAbandonedConversations(4).catch((err) => {
      console.error("[Jobs] Erro ao marcar conversas abandonadas:", err);
    });
  });

  // Diariamente às 3h: limpeza de webhook events antigos
  cron.schedule("0 3 * * *", () => {
    limparWebhookEventsAntigos().catch((err) => {
      console.error("[Jobs] Erro ao limpar webhook events:", err);
    });
  });
}
