import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { autenticarPlataforma, requirePlatformRole } from "../../middlewares/platformAuth";
import { provisionTenant } from "../../platform/provisioning/provisionTenant";
import { logAudit } from "../../platform/services/auditLog";
import { getTenantFeatures, setFeatureFlag } from "../../platform/services/featureFlags";

const router = Router();
router.use(autenticarPlataforma);

// ── Listar tenants ──────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { q, status, planId, page = "1" } = req.query as Record<string, string>;
  const take = 20;
  const skip = (parseInt(page) - 1) * take;

  const where: any = {};
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { usuarios: { some: { email: { contains: q, mode: "insensitive" }, role: "dono" } } },
    ];
  }
  if (status) where.status = status;

  const [rawTenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        nome: true,
        slug: true,
        status: true,
        whatsappStatus: true,
        calendarStatus: true,
        plano: true,
        ativo: true,
        created_at: true,
        provisionedAt: true,
        usuarios: { where: { role: "dono" }, select: { email: true, nome: true } },
        _count: { select: { agendamentos: true, profissionais: true } },
      },
    }),
    prisma.tenant.count({ where }),
  ]);
  const tenants = rawTenants as any[];

  // Enriquecer com subscriptions (busca separada por design de plataforma desacoplada)
  const tenantIds = tenants.map((t: any) => t.id);
  const subs = await prisma.subscription.findMany({
    where: { tenantId: { in: tenantIds } },
    include: { plan: { select: { name: true, priceMonthly: true } } },
  });
  const subMap = Object.fromEntries(subs.map((s) => [s.tenantId, s]));
  const enriched = tenants.map((t: any) => ({ ...t, subscriptions: subMap[t.id] ? [subMap[t.id]] : [] }));

  res.json({ tenants: enriched, total, page: parseInt(page), pages: Math.ceil(total / take) });
});

// ── Detalhe do tenant ───────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.id },
    include: {
      usuarios: { where: { role: "dono" }, select: { id: true, nome: true, email: true } },
      _count: {
        select: { agendamentos: true, clientes: true, profissionais: true, campanhas: true },
      },
    },
  });

  if (!tenant) { res.status(404).json({ erro: "Tenant não encontrado." }); return; }

  // Buscar subscription separadamente (plataforma desacoplada)
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId: req.params.id },
    include: { plan: true },
  });
  const tenantWithSub = { ...tenant, subscriptions: subscription ? [subscription] : [] };

  // Última atividade: agendamento mais recente
  const ultimoAgendamento = await prisma.agendamento.findFirst({
    where: { tenant_id: req.params.id },
    orderBy: { created_at: "desc" },
    select: { created_at: true },
  });

  // Logs de provisionamento
  const provisioningLogs = await prisma.provisioningLog.findMany({
    where: { tenantId: req.params.id },
    orderBy: { createdAt: "asc" },
  });

  // Feature flags
  const features = await getTenantFeatures(req.params.id);

  // Métricas dos últimos 30 dias
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const metrics = await prisma.usageMetric.findMany({
    where: { tenantId: req.params.id, date: { gte: since } },
    orderBy: { date: "desc" },
  });

  const { twilio_auth_token: _, senha_hash: __, google_access_token: ___, google_refresh_token: ____, ...safeTenant } = tenantWithSub as any;

  res.json({ tenant: safeTenant, ultimaAtividade: ultimoAgendamento?.created_at, provisioningLogs, features, metrics });
});

// ── Provisionar novo tenant ────────────────────────────────────────────────
router.post(
  "/provision",
  requirePlatformRole("SUPERADMIN", "OPERATOR"),
  async (req: Request, res: Response): Promise<void> => {
    const { barbershopName, ownerName, ownerEmail, ownerPhone, planId, bringOwnNumber, twilioNumber, twilioAccountSid, twilioAuthToken } = req.body;

    if (!barbershopName || !ownerName || !ownerEmail || !ownerPhone || !planId) {
      res.status(400).json({ erro: "Campos obrigatórios: barbershopName, ownerName, ownerEmail, ownerPhone, planId." });
      return;
    }

    const result = await provisionTenant({ barbershopName, ownerName, ownerEmail, ownerPhone, planId, bringOwnNumber, twilioNumber, twilioAccountSid, twilioAuthToken });

    await logAudit(req.platformUserId!, "tenant.provision", {
      targetTenantId: result.tenantId,
      metadata: { ownerEmail, planId },
      ipAddress: req.ip,
    });

    res.status(201).json(result);
  }
);

// ── Atualizar plano ─────────────────────────────────────────────────────────
router.patch(
  "/:id/plan",
  requirePlatformRole("SUPERADMIN", "OPERATOR"),
  async (req: Request, res: Response): Promise<void> => {
    const { planId } = req.body;
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) { res.status(404).json({ erro: "Plano não encontrado." }); return; }

    await prisma.subscription.upsert({
      where: { tenantId: req.params.id },
      update: { planId, status: "ACTIVE" },
      create: { tenantId: req.params.id, planId, status: "ACTIVE" },
    });

    await logAudit(req.platformUserId!, "tenant.plan_changed", {
      targetTenantId: req.params.id,
      metadata: { newPlanId: planId, planName: plan.name },
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

// ── Suspender ───────────────────────────────────────────────────────────────
router.post(
  "/:id/suspend",
  requirePlatformRole("SUPERADMIN", "OPERATOR"),
  async (req: Request, res: Response): Promise<void> => {
    const { motivo } = req.body;
    await prisma.tenant.update({
      where: { id: req.params.id },
      data: { status: "SUSPENDED", ativo: false },
    });

    await logAudit(req.platformUserId!, "tenant.suspend", {
      targetTenantId: req.params.id,
      metadata: { motivo },
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

// ── Reativar ────────────────────────────────────────────────────────────────
router.post(
  "/:id/reactivate",
  requirePlatformRole("SUPERADMIN", "OPERATOR"),
  async (req: Request, res: Response): Promise<void> => {
    await prisma.tenant.update({
      where: { id: req.params.id },
      data: { status: "ACTIVE", ativo: true },
    });

    await logAudit(req.platformUserId!, "tenant.reactivate", {
      targetTenantId: req.params.id,
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

// ── Cancelar ────────────────────────────────────────────────────────────────
router.post(
  "/:id/cancel",
  requirePlatformRole("SUPERADMIN", "OPERATOR"),
  async (req: Request, res: Response): Promise<void> => {
    await prisma.tenant.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED", ativo: false },
    });

    await prisma.subscription.updateMany({
      where: { tenantId: req.params.id },
      data: { status: "CANCELLED" },
    });

    await logAudit(req.platformUserId!, "tenant.cancel", {
      targetTenantId: req.params.id,
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

// ── Excluir (somente SUPERADMIN, com dupla confirmação via query param) ──────
router.delete(
  "/:id",
  requirePlatformRole("SUPERADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    if (req.query.confirm !== "true") {
      res.status(400).json({ erro: "Adicione ?confirm=true para confirmar a exclusão." });
      return;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) { res.status(404).json({ erro: "Tenant não encontrado." }); return; }

    // Deletar em cascata manual (Prisma não tem cascade automático aqui)
    await prisma.$transaction([
      prisma.auditLog.deleteMany({ where: { targetTenantId: req.params.id } }),
      prisma.usageMetric.deleteMany({ where: { tenantId: req.params.id } }),
      prisma.featureFlag.deleteMany({ where: { tenantId: req.params.id } }),
      prisma.provisioningLog.deleteMany({ where: { tenantId: req.params.id } }),
      prisma.subscription.deleteMany({ where: { tenantId: req.params.id } }),
      prisma.lancamentoComissao.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.regraComissao.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.comissaoPagamento.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.logCampanha.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.campanha.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.avaliacao.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.agendamento.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.listaEspera.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.bloqueio.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.sessaoBot.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.configBot.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.horarioBot.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.whatsAppTemplate.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.interactiveMessageConfig.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.cliente.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.profissional.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.servico.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.usuario.deleteMany({ where: { tenant_id: req.params.id } }),
      prisma.tenant.delete({ where: { id: req.params.id } }),
    ]);

    await logAudit(req.platformUserId!, "tenant.delete", {
      targetTenantId: req.params.id,
      metadata: { nome: tenant.nome, slug: tenant.slug },
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

// ── Exportar dados do tenant (LGPD) ─────────────────────────────────────────
router.get(
  "/:id/export",
  requirePlatformRole("SUPERADMIN", "OPERATOR"),
  async (req: Request, res: Response): Promise<void> => {
    const [tenant, clientes, agendamentos, profissionais, servicos] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: req.params.id }, select: { id: true, nome: true, slug: true, created_at: true } }),
      prisma.cliente.findMany({ where: { tenant_id: req.params.id } }),
      prisma.agendamento.findMany({ where: { tenant_id: req.params.id }, orderBy: { data_hora: "desc" } }),
      prisma.profissional.findMany({ where: { tenant_id: req.params.id } }),
      prisma.servico.findMany({ where: { tenant_id: req.params.id } }),
    ]);

    if (!tenant) { res.status(404).json({ erro: "Tenant não encontrado." }); return; }

    await logAudit(req.platformUserId!, "tenant.export", {
      targetTenantId: req.params.id,
      ipAddress: req.ip,
    });

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="tenant-${tenant.slug}-export.json"`);
    res.json({ exportedAt: new Date(), tenant, clientes, agendamentos, profissionais, servicos });
  }
);

// ── Impersonation ────────────────────────────────────────────────────────────
router.post(
  "/:id/impersonate",
  requirePlatformRole("SUPERADMIN", "OPERATOR", "SUPPORT"),
  async (req: Request, res: Response): Promise<void> => {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) { res.status(404).json({ erro: "Tenant não encontrado." }); return; }

    const token = jwt.sign(
      {
        tenantId: tenant.id,
        slug: tenant.slug,
        role: "dono",
        isImpersonation: true,
        impersonatedBy: req.platformUserId,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    );

    await logAudit(req.platformUserId!, "tenant.impersonate", {
      targetTenantId: req.params.id,
      metadata: { tenantSlug: tenant.slug },
      ipAddress: req.ip,
    });

    res.json({ token, tenantSlug: tenant.slug, expiresIn: "1h" });
  }
);

// ── Reenviar instruções de onboarding ───────────────────────────────────────
router.post(
  "/:id/resend-onboarding",
  requirePlatformRole("SUPERADMIN", "OPERATOR"),
  async (req: Request, res: Response): Promise<void> => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: { usuarios: { where: { role: "dono" } } },
    });
    if (!tenant) { res.status(404).json({ erro: "Tenant não encontrado." }); return; }

    // Plugar email aqui
    console.log(`[EMAIL] Reenvio de onboarding para ${tenant.usuarios[0]?.email}`);

    await logAudit(req.platformUserId!, "tenant.resend_onboarding", {
      targetTenantId: req.params.id,
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

// ── Logs de provisionamento ──────────────────────────────────────────────────
router.get("/:id/provisioning-logs", async (req: Request, res: Response): Promise<void> => {
  const logs = await prisma.provisioningLog.findMany({
    where: { tenantId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(logs);
});

// ── Feature flags do tenant ──────────────────────────────────────────────────
router.get("/:id/features", async (req: Request, res: Response): Promise<void> => {
  const features = await getTenantFeatures(req.params.id);
  res.json(features);
});

router.put(
  "/:id/features",
  requirePlatformRole("SUPERADMIN", "OPERATOR"),
  async (req: Request, res: Response): Promise<void> => {
    const { key, enabled } = req.body;
    if (!key || typeof enabled !== "boolean") {
      res.status(400).json({ erro: "key (string) e enabled (boolean) obrigatórios." });
      return;
    }

    await setFeatureFlag(req.params.id, key, enabled);

    await logAudit(req.platformUserId!, "tenant.feature_flag", {
      targetTenantId: req.params.id,
      metadata: { key, enabled },
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

// ── Verificar saúde das integrações ─────────────────────────────────────────
router.get("/:id/health", async (req: Request, res: Response): Promise<void> => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!tenant) { res.status(404).json({ erro: "Tenant não encontrado." }); return; }

  const googleTokenExpired =
    tenant.google_token_expiry !== null && tenant.google_token_expiry < new Date();

  let calendarStatus = tenant.calendarStatus;
  if (googleTokenExpired && calendarStatus === "CONNECTED") {
    calendarStatus = "EXPIRED";
    await prisma.tenant.update({
      where: { id: req.params.id },
      data: { calendarStatus: "EXPIRED" },
    });
  }

  // Última mensagem processada
  const lastMessage = await prisma.sessaoBot.findFirst({
    where: { tenant_id: req.params.id },
    orderBy: { ultima_mensagem_em: "desc" },
    select: { ultima_mensagem_em: true },
  });

  // Métricas de hoje
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const metricsHoje = await prisma.usageMetric.findUnique({
    where: { tenantId_date: { tenantId: req.params.id, date: today } },
  });

  res.json({
    whatsapp: { status: tenant.whatsappStatus, number: tenant.twilioNumber ?? tenant.telefone_whatsapp },
    calendar: { status: calendarStatus, tokenExpired: googleTokenExpired },
    lastActivity: lastMessage?.ultima_mensagem_em ?? null,
    today: metricsHoje ?? { messagesProcessed: 0, appointmentsCreated: 0, webhookErrors: 0 },
  });
});

export default router;
