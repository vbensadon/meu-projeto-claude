import { Router, type Response, type Request } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

const router = Router();

const AVALIACAO_SECRET = process.env.JWT_SECRET!;

interface AvaliacaoTokenPayload {
  agendamentoId: string;
  tenantId: string;
  tipo: "avaliacao";
}

export function gerarTokenAvaliacao(agendamentoId: string, tenantId: string): string {
  return jwt.sign(
    { agendamentoId, tenantId, tipo: "avaliacao" } satisfies AvaliacaoTokenPayload,
    AVALIACAO_SECRET,
    { expiresIn: "7d" }
  );
}

function validarToken(token: string): AvaliacaoTokenPayload | null {
  try {
    const payload = jwt.verify(token, AVALIACAO_SECRET) as AvaliacaoTokenPayload;
    if (payload.tipo !== "avaliacao") return null;
    return payload;
  } catch {
    return null;
  }
}

router.get("/:agendamentoId/:token", async (req: Request, res: Response): Promise<void> => {
  const payload = validarToken(req.params.token);
  if (!payload || payload.agendamentoId !== req.params.agendamentoId) {
    res.status(400).json({ erro: "Link inválido ou expirado." });
    return;
  }

  const agendamento = await prisma.agendamento.findFirst({
    where: { id: req.params.agendamentoId, tenant_id: payload.tenantId },
    include: {
      profissional: { select: { id: true, nome: true } },
      servico: { select: { nome: true } },
      avaliacao: { select: { id: true } },
    },
  });

  if (!agendamento) { res.status(404).json({ erro: "Agendamento não encontrado." }); return; }

  res.json({
    profissional: agendamento.profissional,
    servico: agendamento.servico,
    data_hora: agendamento.data_hora,
    jaAvaliado: agendamento.avaliacao !== null,
  });
});

const AvaliacaoSchema = z.object({
  nota: z.number().int().min(1).max(5),
  comentario: z.string().max(1000).optional(),
});

router.post("/:agendamentoId/:token", async (req: Request, res: Response): Promise<void> => {
  const payload = validarToken(req.params.token);
  if (!payload || payload.agendamentoId !== req.params.agendamentoId) {
    res.status(400).json({ erro: "Link inválido ou expirado." });
    return;
  }

  const parsed = AvaliacaoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const agendamento = await prisma.agendamento.findFirst({
    where: { id: req.params.agendamentoId, tenant_id: payload.tenantId },
    include: { avaliacao: { select: { id: true } } },
  });

  if (!agendamento) { res.status(404).json({ erro: "Agendamento não encontrado." }); return; }
  if (agendamento.avaliacao) {
    res.status(409).json({ erro: "Este agendamento já foi avaliado." });
    return;
  }

  const avaliacao = await prisma.avaliacao.create({
    data: {
      tenant_id: payload.tenantId,
      agendamento_id: agendamento.id,
      profissional_id: agendamento.profissional_id,
      nota: parsed.data.nota,
      comentario: parsed.data.comentario ?? null,
    },
  });

  res.status(201).json({ mensagem: "Avaliação registrada. Obrigado!", id: avaliacao.id });
});

export default router;
