import { prisma } from "../../lib/prisma";

type MetricField = "messagesProcessed" | "appointmentsCreated" | "botConversations" | "webhookErrors";

export async function incrementMetric(tenantId: string, field: MetricField, by = 1) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.usageMetric.upsert({
    where: { tenantId_date: { tenantId, date: today } },
    update: { [field]: { increment: by } },
    create: { tenantId, date: today, [field]: by },
  });
}
