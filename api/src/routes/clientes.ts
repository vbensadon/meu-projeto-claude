import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";
import { computarMetricasCliente, calcularBadge } from "../services/clienteService";

const router = Router();
router.use(autenticar);

const PAGE_SIZE = 20;

const ListQuerySchema = z.object({
  q: z.string().optional(),
  profissional_id: z.string().optional(),
  frequencia: z.enum(["vip", "regular", "novo"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

router.get("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ erro: "Query inválida.", detalhes: parsed.error.flatten() });
    return;
  }

  const { q, profissional_id, frequencia, page } = parsed.data;

  const clientes = await prisma.cliente.findMany({
    where: {
      tenant_id: tenantId,
      ...(q && {
        OR: [
          { nome: { contains: q, mode: "insensitive" } },
          { telefone: { contains: q } },
        ],
      }),
    },
    orderBy: { created_at: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1, // peek +1 to detect hasMore
  });

  const hasMore = clientes.length > PAGE_SIZE;
  const pagina = hasMore ? clientes.slice(0, PAGE_SIZE) : clientes;

  const telefones = pagina.map((c) => c.telefone);

  const agendamentos = await prisma.agendamento.findMany({
    where: { tenant_id: tenantId, cliente_telefone: { in: telefones }, status: "concluido" },
    select: {
      cliente_telefone: true,
      data_hora: true,
      profissional_id: true,
    },
  });

  const inicioAno = new Date();
  inicioAno.setMonth(inicioAno.getMonth() - 12);

  const agsByTel: Record<string, typeof agendamentos> = {};
  for (const a of agendamentos) {
    (agsByTel[a.cliente_telefone] ??= []).push(a);
  }

  let resultado = pagina.map((c) => {
    const ags = agsByTel[c.telefone] ?? [];
    const agsFiltrados = profissional_id
      ? ags.filter((a) => a.profissional_id === profissional_id)
      : ags;
    const totalVisitas = agsFiltrados.length;
    const visitasNoAno = agsFiltrados.filter((a) => a.data_hora >= inicioAno).length;
    const badge = calcularBadge(visitasNoAno);
    const ultimoAtendimento = ags.sort((a, b) => b.data_hora.getTime() - a.data_hora.getTime())[0]?.data_hora ?? null;
    return { ...c, totalVisitas, ultimoAtendimento, badge };
  });

  if (profissional_id) resultado = resultado.filter((c) => c.totalVisitas > 0);
  if (frequencia) resultado = resultado.filter((c) => c.badge === frequencia);

  const total = await prisma.cliente.count({
    where: {
      tenant_id: tenantId,
      ...(q && { OR: [{ nome: { contains: q, mode: "insensitive" } }, { telefone: { contains: q } }] }),
    },
  });

  res.json({ clientes: resultado, total, page, hasMore });
});

const InativosQuerySchema = z.object({
  dias: z.coerce.number().int().min(1).default(30),
});

router.get("/inativos", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = InativosQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ erro: "Query inválida.", detalhes: parsed.error.flatten() });
    return;
  }

  const { dias } = parsed.data;
  const corte = new Date();
  corte.setDate(corte.getDate() - dias);

  const clientes = await prisma.cliente.findMany({
    where: { tenant_id: tenantId },
  });

  const telefones = clientes.map((c) => c.telefone);

  const ultimosPorTel = await prisma.agendamento.findMany({
    where: {
      tenant_id: tenantId,
      cliente_telefone: { in: telefones },
      status: "concluido",
    },
    select: {
      cliente_telefone: true,
      data_hora: true,
      profissional: { select: { nome: true } },
      servico: { select: { nome: true } },
    },
    orderBy: { data_hora: "desc" },
  });

  const ultimoMap: Record<string, (typeof ultimosPorTel)[0]> = {};
  for (const a of ultimosPorTel) {
    if (!ultimoMap[a.cliente_telefone]) ultimoMap[a.cliente_telefone] = a;
  }

  const totalVisitasMap: Record<string, number> = {};
  for (const a of ultimosPorTel) {
    totalVisitasMap[a.cliente_telefone] = (totalVisitasMap[a.cliente_telefone] ?? 0) + 1;
  }

  const inativos = clientes
    .map((c) => {
      const ultimo = ultimoMap[c.telefone];
      const ultimaVisita = ultimo?.data_hora ?? null;
      const diasSemVisita = ultimaVisita
        ? Math.floor((Date.now() - ultimaVisita.getTime()) / 86400000)
        : null;
      return {
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        ultimaVisita,
        diasSemVisita,
        ultimoServico: ultimo?.servico.nome ?? null,
        ultimoProfissional: ultimo?.profissional.nome ?? null,
        totalVisitas: totalVisitasMap[c.telefone] ?? 0,
      };
    })
    .filter((c) => c.ultimaVisita === null || (c.diasSemVisita !== null && c.diasSemVisita >= dias))
    .sort((a, b) => (b.diasSemVisita ?? 9999) - (a.diasSemVisita ?? 9999));

  res.json({ clientes: inativos, total: inativos.length, dias });
});

router.get("/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;

  const cliente = await prisma.cliente.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!cliente) { res.status(404).json({ erro: "Cliente não encontrado." }); return; }

  const metricas = await computarMetricasCliente(tenantId, cliente.telefone);

  res.json({ ...cliente, ...metricas });
});

const PatchClienteSchema = z.object({
  notas: z.string().max(5000).nullable().optional(),
  preferencias: z.string().max(2000).nullable().optional(),
  aniversario: z.string().datetime().nullable().optional(),
  nome: z.string().min(1).max(150).optional(),
});

router.patch("/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = PatchClienteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const existente = await prisma.cliente.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!existente) { res.status(404).json({ erro: "Cliente não encontrado." }); return; }

  const atualizado = await prisma.cliente.update({
    where: { id: existente.id },
    data: {
      ...(parsed.data.notas !== undefined && { notas: parsed.data.notas }),
      ...(parsed.data.preferencias !== undefined && { preferencias: parsed.data.preferencias }),
      ...(parsed.data.aniversario !== undefined && {
        aniversario: parsed.data.aniversario ? new Date(parsed.data.aniversario) : null,
      }),
      ...(parsed.data.nome !== undefined && { nome: parsed.data.nome }),
    },
  });

  res.json(atualizado);
});

const AgHistoricoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

router.get("/:id/agendamentos", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = AgHistoricoQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ erro: "Query inválida.", detalhes: parsed.error.flatten() });
    return;
  }

  const cliente = await prisma.cliente.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!cliente) { res.status(404).json({ erro: "Cliente não encontrado." }); return; }

  const { page } = parsed.data;
  const total = await prisma.agendamento.count({
    where: { tenant_id: tenantId, cliente_telefone: cliente.telefone },
  });

  const agendamentos = await prisma.agendamento.findMany({
    where: { tenant_id: tenantId, cliente_telefone: cliente.telefone },
    include: {
      profissional: { select: { id: true, nome: true } },
      servico: { select: { id: true, nome: true, preco: true } },
    },
    orderBy: { data_hora: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  res.json({ agendamentos, total, page });
});

export default router;
