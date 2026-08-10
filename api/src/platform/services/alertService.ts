import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

type AlertType =
  | "WEBHOOK_FAILURES"
  | "CALENDAR_TOKEN_EXPIRED"
  | "MESSAGE_LIMIT_REACHED"
  | "BOT_INACTIVITY"
  | "INTEGRATION_ERROR"
  | "PAYMENT_FAILED";

type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

interface CreateAlertOptions {
  tenantId?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cria ou reabre alerta; evita duplicata: se já há um OPEN/ACKNOWLEDGED
 * do mesmo tipo+tenant, apenas atualiza título/descrição/metadata.
 */
export async function createOrUpdateAlert(opts: CreateAlertOptions) {
  const existing = await prisma.platformAlert.findFirst({
    where: {
      tenantId: opts.tenantId ?? null,
      type: opts.type,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
  });

  if (existing) {
    return prisma.platformAlert.update({
      where: { id: existing.id },
      data: {
        severity: opts.severity,
        title: opts.title,
        description: opts.description,
        metadata: opts.metadata ? (opts.metadata as Prisma.InputJsonValue) : undefined,
        status: "OPEN",
        resolvedAt: null,
        resolvedBy: null,
      },
    });
  }

  const alert = await prisma.platformAlert.create({
    data: {
      tenantId: opts.tenantId ?? null,
      type: opts.type,
      severity: opts.severity,
      title: opts.title,
      description: opts.description,
      metadata: opts.metadata ? (opts.metadata as Prisma.InputJsonValue) : undefined,
    },
  });

  await dispatchAlert(alert);
  return alert;
}

/**
 * Envia notificação pelos canais configurados cuja minSeverity seja atendida.
 */
export async function dispatchAlert(alert: {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  tenantId?: string | null;
}) {
  const severityRank: Record<AlertSeverity, number> = { INFO: 0, WARNING: 1, CRITICAL: 2 };
  const channels = await prisma.alertChannelConfig.findMany({ where: { enabled: true } });

  for (const ch of channels) {
    if (severityRank[ch.minSeverity as AlertSeverity] > severityRank[alert.severity]) continue;

    try {
      if (ch.channel === "email") {
        await sendEmailAlert(ch.target, alert);
      } else if (ch.channel === "slack") {
        // stub: POST ch.target (Slack Incoming Webhook URL) com JSON { text }
        console.log(`[Alert] Slack stub → ${ch.target}: [${alert.severity}] ${alert.title}`);
      } else if (ch.channel === "whatsapp") {
        // stub: enviar via Twilio
        console.log(`[Alert] WhatsApp stub → ${ch.target}: [${alert.severity}] ${alert.title}`);
      }
    } catch (err) {
      console.error(`[Alert] Falha ao despachar canal ${ch.channel}:`, err);
    }
  }
}

async function sendEmailAlert(
  to: string,
  alert: { type: string; severity: string; title: string; description: string; tenantId?: string | null }
) {
  // Mesma estratégia de email já usada no projeto: console.log em dev,
  // substituir por SendGrid/SES em produção
  console.log(
    `[Alert][EMAIL] Para: ${to}\nAssunto: [AgendaBot ${alert.severity}] ${alert.title}\n${alert.description}\nTenant: ${alert.tenantId ?? "plataforma"}`
  );
}
