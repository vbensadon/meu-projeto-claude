import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";

const router = Router();
router.use(autenticar);

const ServicoSchema = z.object({
  nome: z.string().min(1).max(100),
  duracao_minutos: z.number().int().min(5).max(480),
  preco: z.number().min(0),
});

router.get("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const servicos = await prisma.servico.findMany({
    where: { tenant_id: tenantId },
    orderBy: { nome: "asc" },
  });
  res.json(servicos);
});

router.post("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = ServicoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const servico = await prisma.servico.create({
    data: { ...parsed.data, tenant_id: tenantId },
  });
  res.status(201).json(servico);
});

router.put("/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = ServicoSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const existente = await prisma.servico.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!existente) { res.status(404).json({ erro: "Serviço não encontrado." }); return; }

  const atualizado = await prisma.servico.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json(atualizado);
});

router.delete("/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;

  const existente = await prisma.servico.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!existente) { res.status(404).json({ erro: "Serviço não encontrado." }); return; }

  await prisma.servico.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
