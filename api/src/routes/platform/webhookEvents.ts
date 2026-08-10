import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { autenticarPlataforma, requirePlatformRole } from "../../middlewares/platformAuth";
import { logAudit } from "../../platform/services/auditLog";

const router = Router();
router.use(autenticarPlataforma);
router.use(requirePlatformRole("SUPERADMIN", "OPERATOR"));

// GET /api/platform/webhook-events
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { status, source, tenantId, page = "1", limit = "30" } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (source) where.source = source;
  if (tenantId) where.tenantId = tenantId;

  const [events, total] = await Promise.all([
    prisma.webhookEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: parseInt(limit),
    }),
    prisma.webhookEvent.count({ where }),
  ]);

  // Enriquece com nome do tenant
  const tenantIds = [...new Set(events.map((e) => e.tenantId).filter(Boolean))] as string[];
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, nome: true, slug: true },
  });
  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]));

  res.json({
    events: events.map((e) => ({ ...e, tenant: e.tenantId ? tenantMap[e.tenantId] ?? null : null })),
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
  });
});

// POST /api/platform/webhook-events/:id/replay
router.post("/:id/replay", async (req: Request, res: Response): Promise<void> => {
  const event = await prisma.webhookEvent.findUnique({ where: { id: req.params.id } });
  if (!event) {
    res.status(404).json({ erro: "Evento não encontrado" });
    return;
  }

  if (event.status === "PROCESSED") {
    res.status(400).json({ erro: "Este evento já foi processado com sucesso." });
    return;
  }

  // Incrementa tentativas e marca como RECEIVED para reprocessamento
  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { status: "RECEIVED", attempts: { increment: 1 }, lastError: null },
  });

  await logAudit(req.platformUserId!, "webhook.replay", {
    targetTenantId: event.tenantId ?? undefined,
    metadata: { eventId: event.id, source: event.source, attempts: event.attempts + 1 },
  });

  // Reexecuta o payload via fetch interno
  try {
    if (event.source === "twilio" && event.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: event.tenantId }, select: { slug: true } });
      if (!tenant) throw new Error("Tenant não encontrado para replay");

      const payload = event.payload as Record<string, string>;

      // Faz POST interno para o próprio webhook handler
      const baseUrl = process.env.INTERNAL_BASE_URL ?? "http://localhost:3001";
      const response = await fetch(`${baseUrl}/api/webhook/${tenant.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(payload).toString(),
      });

      if (response.ok || response.status === 200) {
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: "PROCESSED", processedAt: new Date() },
        });
        res.json({ ok: true, message: "Evento reprocessado com sucesso." });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } else {
      // Fonte não suportada para replay automatizado
      res.json({
        ok: false,
        message: `Replay automático não suportado para source '${event.source}'. Evento marcado como RECEIVED para reprocessamento manual.`,
      });
    }
  } catch (err) {
    const errMsg = String(err);
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", lastError: errMsg.slice(0, 500) },
    });
    res.status(500).json({ erro: `Falha no replay: ${errMsg}` });
  }
});

export default router;
