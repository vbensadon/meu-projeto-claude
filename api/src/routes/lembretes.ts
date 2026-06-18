import { Router, type Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";

const router = Router();
router.use(autenticar);

router.get("/historico", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;

  const historico = await prisma.agendamento.findMany({
    where: {
      tenant_id: tenantId,
      lembrete_enviado_em: { not: null },
    },
    select: {
      id: true,
      cliente_nome: true,
      data_hora: true,
      lembrete_enviado_em: true,
      lembrete_status: true,
      profissional: { select: { id: true, nome: true } },
      servico: { select: { id: true, nome: true } },
    },
    orderBy: { lembrete_enviado_em: "desc" },
    take: 50,
  });

  res.json(historico);
});

export default router;
