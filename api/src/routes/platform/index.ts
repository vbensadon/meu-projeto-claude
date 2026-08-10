import { Router } from "express";
import platformAuthRouter from "./auth";
import platformTenantsRouter from "./tenants";
import platformPlansRouter from "./plans";
import platformAuditRouter from "./audit";
import platformDashboardRouter from "./dashboard";
import platformAlertsRouter from "./alerts";
import platformConversationsRouter from "./conversations";
import platformWebhookEventsRouter from "./webhookEvents";
import platformOnboardingRouter from "./onboarding";

const router = Router();

router.use("/auth", platformAuthRouter);
router.use("/tenants", platformTenantsRouter);
router.use("/plans", platformPlansRouter);
router.use("/audit", platformAuditRouter);
router.use("/dashboard", platformDashboardRouter);
router.use("/alerts", platformAlertsRouter);
router.use("/", platformConversationsRouter);       // /tenants/:id/conversations e /conversations/:id
router.use("/webhook-events", platformWebhookEventsRouter);
router.use("/onboarding", platformOnboardingRouter);

// Endpoint público para o painel do tenant consultar feature flags
router.get("/features/:tenantId", async (req, res) => {
  const { prisma } = await import("../../lib/prisma");
  const flags = await prisma.featureFlag.findMany({ where: { tenantId: req.params.tenantId } });
  const map = Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
  res.json(map);
});

export default router;
