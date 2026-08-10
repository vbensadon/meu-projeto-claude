import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { autenticarPlataforma, requirePlatformRole } from "../../middlewares/platformAuth";

const router = Router();
router.use(autenticarPlataforma);

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const plans = await prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } });
  res.json(plans);
});

router.post(
  "/",
  requirePlatformRole("SUPERADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    const { name, priceMonthly, maxBarbers, maxMessages, features } = req.body;
    if (!name || priceMonthly == null || !maxBarbers || !maxMessages) {
      res.status(400).json({ erro: "name, priceMonthly, maxBarbers e maxMessages são obrigatórios." });
      return;
    }
    const plan = await prisma.plan.create({
      data: { name, priceMonthly, maxBarbers, maxMessages, features: features ?? {} },
    });
    res.status(201).json(plan);
  }
);

router.put(
  "/:id",
  requirePlatformRole("SUPERADMIN"),
  async (req: Request, res: Response): Promise<void> => {
    const { name, priceMonthly, maxBarbers, maxMessages, features, active } = req.body;
    const plan = await prisma.plan.update({
      where: { id: req.params.id },
      data: { name, priceMonthly, maxBarbers, maxMessages, features, active },
    });
    res.json(plan);
  }
);

export default router;
