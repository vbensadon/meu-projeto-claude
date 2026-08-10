import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { autenticarPlataforma, requirePlatformRole } from "../../middlewares/platformAuth";
import { logAudit } from "../../platform/services/auditLog";

const router = Router();
router.use(autenticarPlataforma);

// GET /api/platform/alerts
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { status, severity, type, tenantId, page = "1", limit = "30" } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (severity) where.severity = severity;
  if (type) where.type = type;
  if (tenantId) where.tenantId = tenantId;

  const [alerts, total] = await Promise.all([
    prisma.platformAlert.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip,
      take: parseInt(limit),
    }),
    prisma.platformAlert.count({ where }),
  ]);

  // Enriquece com nome do tenant
  const tenantIds = [...new Set(alerts.map((a) => a.tenantId).filter(Boolean))] as string[];
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, nome: true, slug: true },
  });
  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]));

  res.json({
    alerts: alerts.map((a) => ({
      ...a,
      tenant: a.tenantId ? tenantMap[a.tenantId] ?? null : null,
    })),
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
  });
});

// GET /api/platform/alerts/counts — contador por severidade para o sino
router.get("/counts", async (_req: Request, res: Response): Promise<void> => {
  const rows = await prisma.platformAlert.groupBy({
    by: ["severity"],
    where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    _count: { id: true },
  });
  const counts: Record<string, number> = { INFO: 0, WARNING: 0, CRITICAL: 0 };
  for (const r of rows) counts[r.severity] = r._count.id;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  res.json({ total, ...counts });
});

// PATCH /api/platform/alerts/:id/acknowledge
router.patch("/:id/acknowledge", async (req: Request, res: Response): Promise<void> => {
  const alert = await prisma.platformAlert.update({
    where: { id: req.params.id },
    data: { status: "ACKNOWLEDGED" },
  });
  await logAudit(req.platformUserId!, "alert.acknowledge", {
    targetTenantId: alert.tenantId ?? undefined,
    metadata: { alertId: alert.id, type: alert.type },
  });
  res.json(alert);
});

// PATCH /api/platform/alerts/:id/resolve
router.patch("/:id/resolve", async (req: Request, res: Response): Promise<void> => {
  const alert = await prisma.platformAlert.update({
    where: { id: req.params.id },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: req.platformUserId! },
  });
  await logAudit(req.platformUserId!, "alert.resolve", {
    targetTenantId: alert.tenantId ?? undefined,
    metadata: { alertId: alert.id, type: alert.type },
  });
  res.json(alert);
});

// GET /api/platform/alert-channels
router.get("/channels", requirePlatformRole("SUPERADMIN", "OPERATOR"), async (_req: Request, res: Response): Promise<void> => {
  const channels = await prisma.alertChannelConfig.findMany();
  res.json(channels);
});

// PUT /api/platform/alert-channels — upsert completo da lista
router.put("/channels", requirePlatformRole("SUPERADMIN"), async (req: Request, res: Response): Promise<void> => {
  const configs = req.body as Array<{
    id?: string;
    channel: string;
    target: string;
    minSeverity: string;
    enabled: boolean;
  }>;

  // Remove todos e recria (lista pequena — operação segura)
  await prisma.alertChannelConfig.deleteMany();
  const created = await prisma.alertChannelConfig.createMany({
    data: configs.map(({ id: _id, ...c }) => ({
      ...c,
      minSeverity: c.minSeverity as "INFO" | "WARNING" | "CRITICAL",
    })),
  });

  await logAudit(req.platformUserId!, "alert_channels.update", {
    metadata: { count: created.count },
  });
  res.json({ ok: true, count: created.count });
});

export default router;
