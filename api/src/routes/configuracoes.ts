import { Router, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";

const router = Router();
router.use(autenticar);

const ConfigSchema = z.object({
  nome: z.string().min(1).max(100).optional(),
  telefone_whatsapp: z.string().optional(),
  twilio_account_sid: z.string().optional(),
  twilio_auth_token: z.string().optional(),
  google_calendar_id_dono: z.string().optional(),
  lembretes_ativos: z.boolean().optional(),
  mensagem_lembrete: z.string().max(1000).nullable().optional(),
});

const SenhaSchema = z.object({
  senha_atual: z.string().min(1),
  nova_senha: z.string().min(6),
});

router.get("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      id: true, nome: true, slug: true, telefone_whatsapp: true,
      twilio_account_sid: true, google_calendar_id_dono: true,
      plano: true, ativo: true, created_at: true,
      google_token_expiry: true,
      lembretes_ativos: true, mensagem_lembrete: true,
      // nunca expor tokens ou senha
    },
  });
  res.json({
    ...tenant,
    google_calendar_conectado: !!tenant.google_token_expiry,
  });
});

router.put("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = ConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const atualizado = await prisma.tenant.update({
    where: { id: tenantId },
    data: parsed.data,
    select: { id: true, nome: true, slug: true, telefone_whatsapp: true, plano: true },
  });
  res.json(atualizado);
});

router.put("/senha", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = SenhaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const senhaOk = await bcrypt.compare(parsed.data.senha_atual, tenant.senha_hash);
  if (!senhaOk) { res.status(401).json({ erro: "Senha atual incorreta." }); return; }

  const novoHash = await bcrypt.hash(parsed.data.nova_senha, 10);
  await prisma.tenant.update({ where: { id: tenantId }, data: { senha_hash: novoHash } });
  res.json({ mensagem: "Senha alterada com sucesso." });
});

export default router;
