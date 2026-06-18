import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";

const router = Router();
router.use(autenticar);

const ProfissionalSchema = z.object({
  nome: z.string().min(1).max(100),
  telefone_whatsapp: z.string().optional(),
  google_calendar_id: z.string().optional(),
  ativo: z.boolean().optional(),
  comissao_percentual: z.number().min(0).max(100).optional(),
});

router.get("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const profissionais = await prisma.profissional.findMany({
    where: { tenant_id: tenantId },
    orderBy: { nome: "asc" },
  });
  res.json(profissionais);
});

router.post("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = ProfissionalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const profissional = await prisma.profissional.create({
    data: { ...parsed.data, tenant_id: tenantId },
  });
  res.status(201).json(profissional);
});

router.put("/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = ProfissionalSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const existente = await prisma.profissional.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!existente) { res.status(404).json({ erro: "Profissional não encontrado." }); return; }

  const atualizado = await prisma.profissional.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json(atualizado);
});

router.delete("/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;

  const existente = await prisma.profissional.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!existente) { res.status(404).json({ erro: "Profissional não encontrado." }); return; }

  // Soft delete
  await prisma.profissional.update({ where: { id: req.params.id }, data: { ativo: false } });
  res.status(204).send();
});

export default router;
