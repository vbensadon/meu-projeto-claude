import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { autenticar, requireRole } from "../middlewares/auth";

const router = Router();
router.use(autenticar);
router.use(requireRole("dono"));

const DIAS = [0, 1, 2, 3, 4, 5, 6]; // dom..sab

async function obterOuCriarConfig(tenantId: string) {
  const existente = await prisma.configBot.findUnique({ where: { tenant_id: tenantId } });
  if (existente) return existente;
  return prisma.configBot.create({ data: { tenant_id: tenantId } });
}

async function obterOuCriarHorarios(tenantId: string) {
  const existentes = await prisma.horarioBot.findMany({ where: { tenant_id: tenantId }, orderBy: { dia_semana: "asc" } });
  if (existentes.length === 7) return existentes;

  const diasFaltando = DIAS.filter((d) => !existentes.some((h) => h.dia_semana === d));
  if (diasFaltando.length > 0) {
    await prisma.horarioBot.createMany({
      data: diasFaltando.map((dia) => ({
        tenant_id: tenantId,
        dia_semana: dia,
        ativo: dia !== 0, // domingo desativado por padrão
        hora_inicio: "08:00",
        hora_fim: "18:00",
      })),
    });
  }
  return prisma.horarioBot.findMany({ where: { tenant_id: tenantId }, orderBy: { dia_semana: "asc" } });
}

// GET /api/config-bot — retorna mensagens + horários
router.get("/", async (req, res: Response): Promise<void> => {
  try {
    const [config, horarios] = await Promise.all([
      obterOuCriarConfig(req.tenantId),
      obterOuCriarHorarios(req.tenantId),
    ]);
    res.json({ config, horarios });
  } catch (err) {
    console.error("[ConfigBot] GET:", err);
    res.status(500).json({ erro: "Erro ao buscar configurações do bot." });
  }
});

// PUT /api/config-bot/mensagens
const MensagensSchema = z.object({
  msg_boas_vindas:   z.string().min(1).max(1000).optional(),
  msg_confirmacao:   z.string().min(1).max(1000).optional(),
  msg_cancelamento:  z.string().min(1).max(1000).optional(),
  msg_fora_horario:  z.string().min(1).max(1000).optional(),
  msg_reagendamento: z.string().min(1).max(1000).optional(),
  msg_lista_espera:  z.string().min(1).max(1000).optional(),
});

router.put("/mensagens", async (req, res: Response): Promise<void> => {
  const parsed = MensagensSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() }); return; }

  try {
    const config = await prisma.configBot.upsert({
      where: { tenant_id: req.tenantId },
      update: parsed.data,
      create: { tenant_id: req.tenantId, ...parsed.data },
    });
    res.json({ config });
  } catch (err) {
    console.error("[ConfigBot] PUT mensagens:", err);
    res.status(500).json({ erro: "Erro ao salvar mensagens." });
  }
});

// PUT /api/config-bot/horarios — recebe array de horários
const HorarioSchema = z.object({
  dia_semana:  z.number().int().min(0).max(6),
  ativo:       z.boolean(),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
  hora_fim:    z.string().regex(/^\d{2}:\d{2}$/),
});

router.put("/horarios", async (req, res: Response): Promise<void> => {
  const parsed = z.array(HorarioSchema).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() }); return; }

  try {
    await Promise.all(
      parsed.data.map((h) =>
        prisma.horarioBot.upsert({
          where: { tenant_id_dia_semana: { tenant_id: req.tenantId, dia_semana: h.dia_semana } },
          update: { ativo: h.ativo, hora_inicio: h.hora_inicio, hora_fim: h.hora_fim },
          create: { tenant_id: req.tenantId, ...h },
        })
      )
    );
    const horarios = await prisma.horarioBot.findMany({ where: { tenant_id: req.tenantId }, orderBy: { dia_semana: "asc" } });
    res.json({ horarios });
  } catch (err) {
    console.error("[ConfigBot] PUT horarios:", err);
    res.status(500).json({ erro: "Erro ao salvar horários." });
  }
});

// PUT /api/config-bot/servicos-ordem — recebe array de { id, ordem }
router.put("/servicos-ordem", async (req, res: Response): Promise<void> => {
  const parsed = z.array(z.object({ id: z.string(), ordem: z.number().int() })).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ erro: "Dados inválidos." }); return; }

  try {
    await Promise.all(
      parsed.data.map(({ id, ordem }) =>
        prisma.servico.updateMany({ where: { id, tenant_id: req.tenantId }, data: { ordem } })
      )
    );
    res.json({ mensagem: "Ordem atualizada." });
  } catch (err) {
    console.error("[ConfigBot] PUT servicos-ordem:", err);
    res.status(500).json({ erro: "Erro ao salvar ordem dos serviços." });
  }
});

export default router;
