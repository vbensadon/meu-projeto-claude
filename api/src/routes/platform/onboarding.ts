import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { autenticarPlataforma } from "../../middlewares/platformAuth";

const router = Router();
router.use(autenticarPlataforma);

// Etapas do funil (em ordem)
const FUNIL_STEPS = [
  { key: "criado", label: "Tenant criado" },
  { key: "primeiro_login", label: "Primeiro login do dono" },
  { key: "calendar_conectado", label: "Google Calendar conectado" },
  { key: "whatsapp_conectado", label: "WhatsApp conectado" },
  { key: "primeiro_agendamento", label: "Primeiro agendamento" },
];

function detectarEtapaTenant(tenant: {
  status: string;
  whatsappStatus: string;
  calendarStatus: string;
  provisionedAt: Date | null;
  _count: { agendamentos: number };
  usuarios: { created_at: Date }[];
}) {
  // Estima primeiro login: se usuário foi criado após provisionedAt (diferença > 0)
  const temPrimeiroLogin =
    tenant.usuarios.length > 0 &&
    tenant.provisionedAt !== null &&
    tenant.usuarios[0].created_at > tenant.provisionedAt;

  if (tenant._count.agendamentos > 0) return "primeiro_agendamento";
  if (tenant.whatsappStatus === "CONNECTED") return "whatsapp_conectado";
  if (tenant.calendarStatus === "CONNECTED") return "calendar_conectado";
  if (temPrimeiroLogin) return "primeiro_login";
  return "criado";
}

// GET /api/platform/onboarding/funnel
router.get("/funnel", async (_req: Request, res: Response): Promise<void> => {
  const tenants = await prisma.tenant.findMany({
    where: { status: { notIn: ["CANCELLED"] } },
    select: {
      id: true,
      status: true,
      whatsappStatus: true,
      calendarStatus: true,
      provisionedAt: true,
      created_at: true,
      _count: { select: { agendamentos: true } },
      usuarios: {
        where: { role: "dono" },
        select: { created_at: true },
        take: 1,
      },
    },
  });

  // Conta por etapa
  const contagem: Record<string, number> = {};
  const datasPorEtapa: Record<string, number[]> = {};

  for (const step of FUNIL_STEPS) {
    contagem[step.key] = 0;
    datasPorEtapa[step.key] = [];
  }

  for (const t of tenants) {
    const etapa = detectarEtapaTenant(t);
    // Incrementa esta etapa e todas as anteriores (funil acumulativo)
    let counting = true;
    for (const step of FUNIL_STEPS) {
      if (counting) contagem[step.key]++;
      if (step.key === etapa) counting = false;
    }

    // Dias até atingir esta etapa
    const diasDesdeCreacao = Math.floor(
      (Date.now() - t.created_at.getTime()) / (1000 * 60 * 60 * 24)
    );
    datasPorEtapa[etapa].push(diasDesdeCreacao);
  }

  const total = tenants.length;
  const funil = FUNIL_STEPS.map((step, i) => {
    const prev = i > 0 ? contagem[FUNIL_STEPS[i - 1].key] : total;
    const taxaConversao = prev > 0 ? Math.round((contagem[step.key] / prev) * 100) : 100;
    const dias = datasPorEtapa[step.key];
    const mediaDias = dias.length > 0 ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null;
    return {
      ...step,
      count: contagem[step.key],
      taxaConversao,
      mediaDiasParaChegar: mediaDias,
    };
  });

  // Gargalo: etapa com menor taxa de conversão (exceto a primeira)
  const gargalo = funil.slice(1).reduce((min, step) =>
    step.taxaConversao < min.taxaConversao ? step : min
  , funil[1]);

  res.json({ total, funil, gargalo: gargalo?.key ?? null });
});

// GET /api/platform/onboarding/stuck?step=&days=
router.get("/stuck", async (req: Request, res: Response): Promise<void> => {
  const step = (req.query.step as string) ?? "criado";
  const days = parseInt((req.query.days as string) ?? "3");
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const tenants = await prisma.tenant.findMany({
    where: {
      status: { notIn: ["CANCELLED"] },
      created_at: { lt: cutoff },
    },
    select: {
      id: true,
      nome: true,
      slug: true,
      status: true,
      whatsappStatus: true,
      calendarStatus: true,
      provisionedAt: true,
      created_at: true,
      _count: { select: { agendamentos: true } },
      usuarios: {
        where: { role: "dono" },
        select: { nome: true, email: true, created_at: true },
        take: 1,
      },
    },
    orderBy: { created_at: "asc" },
  });

  const travados = tenants.filter((t) => {
    const etata = detectarEtapaTenant({
      ...t,
      usuarios: t.usuarios.map((u) => ({ ...u, created_at: u.created_at })),
    });
    return etata === step;
  });

  const diasPorTenant = travados.map((t) => ({
    id: t.id,
    nome: t.nome,
    slug: t.slug,
    status: t.status,
    etapaAtual: step,
    diasNaEtapa: Math.floor((Date.now() - t.created_at.getTime()) / (1000 * 60 * 60 * 24)),
    owner: t.usuarios[0] ?? null,
  }));

  res.json({ step, days, total: diasPorTenant.length, tenants: diasPorTenant });
});

export default router;
