import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { autenticarPlataforma, requirePlatformRole } from "../../middlewares/platformAuth";

const router = Router();
router.use(autenticarPlataforma);
router.use(requirePlatformRole("SUPERADMIN", "OPERATOR"));

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { platformUserId, action, targetTenantId, from, to, page = "1" } = req.query as Record<string, string>;
  const take = 50;
  const skip = (parseInt(page) - 1) * take;

  const where: any = {};
  if (platformUserId) where.platformUserId = platformUserId;
  if (action) where.action = { contains: action };
  if (targetTenantId) where.targetTenantId = targetTenantId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { platformUser: { select: { name: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, total, page: parseInt(page), pages: Math.ceil(total / take) });
});

export default router;
