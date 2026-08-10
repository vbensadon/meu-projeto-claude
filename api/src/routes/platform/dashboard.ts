import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { autenticarPlataforma } from "../../middlewares/platformAuth";

const router = Router();
router.use(autenticarPlataforma);

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  // Subscriptions PAST_DUE para encontrar tenants inadimplentes
  const pastDueSubscriptions = await prisma.subscription.findMany({
    where: { status: "PAST_DUE" },
    select: { tenantId: true },
  });
  const pastDueTenantIds = pastDueSubscriptions.map((s) => s.tenantId);

  const [
    totalByStatus,
    newThisMonth,
    activeSubscriptions,
    tenantsWithIssues,
    metricsToday,
    metricsMonth,
  ] = await Promise.all([
    prisma.tenant.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.tenant.count({ where: { created_at: { gte: startOfMonth } } }),
    prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "TRIAL"] } },
      include: { plan: { select: { priceMonthly: true } } },
    }),
    prisma.tenant.findMany({
      where: {
        OR: [
          { status: "SUSPENDED" },
          { whatsappStatus: "ERROR" },
          { calendarStatus: "EXPIRED" },
          ...(pastDueTenantIds.length > 0 ? [{ id: { in: pastDueTenantIds } }] : []),
        ],
      },
      select: {
        id: true,
        nome: true,
        slug: true,
        status: true,
        whatsappStatus: true,
        calendarStatus: true,
      },
      take: 10,
    }),
    prisma.usageMetric.aggregate({
      where: { date: startOfDay },
      _sum: { messagesProcessed: true, appointmentsCreated: true, webhookErrors: true, botConversations: true },
    }),
    prisma.usageMetric.aggregate({
      where: { date: { gte: startOfMonth } },
      _sum: { messagesProcessed: true, appointmentsCreated: true },
    }),
  ]);

  // Enriquecer tenantsWithIssues com status da subscription
  const tenantIds = tenantsWithIssues.map((t) => t.id);
  const subs = await prisma.subscription.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { tenantId: true, status: true },
  });
  const subMap = Object.fromEntries(subs.map((s) => [s.tenantId, s.status]));

  const mrr = activeSubscriptions.reduce(
    (acc, s) => acc + Number(s.plan.priceMonthly),
    0
  );

  const statusMap: Record<string, number> = {};
  for (const row of totalByStatus) {
    statusMap[row.status] = row._count.id;
  }

  res.json({
    tenants: {
      byStatus: statusMap,
      total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      newThisMonth,
    },
    mrr,
    messages: {
      today: metricsToday._sum.messagesProcessed ?? 0,
      thisMonth: metricsMonth._sum.messagesProcessed ?? 0,
    },
    appointments: {
      today: metricsToday._sum.appointmentsCreated ?? 0,
      thisMonth: metricsMonth._sum.appointmentsCreated ?? 0,
    },
    webhookErrors: { today: metricsToday._sum.webhookErrors ?? 0 },
    tenantsWithIssues: tenantsWithIssues.map((t) => ({ ...t, subscriptionStatus: subMap[t.id] ?? null })),
  });
});

export default router;
