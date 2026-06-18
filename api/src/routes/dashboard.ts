import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { autenticar, requireRole } from "../middlewares/auth";

const router = Router();
router.use(autenticar);
router.use(requireRole("dono", "gerente"));

const QuerySchema = z
  .object({
    periodo: z.enum(["hoje", "semana", "mes", "personalizado"]).default("mes"),
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine(
    (d) => d.periodo !== "personalizado" || (d.data_inicio && d.data_fim),
    { message: "Informe data_inicio e data_fim para período personalizado." }
  );

function calcularIntervalo(
  periodo: "hoje" | "semana" | "mes" | "personalizado",
  dataInicio?: string,
  dataFim?: string
): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.toDateString());
  const fimHoje = new Date(inicioHoje.getTime() + 86400000);

  switch (periodo) {
    case "hoje":
      return { inicio: inicioHoje, fim: fimHoje };
    case "semana": {
      const inicio = new Date(inicioHoje.getTime() - 6 * 86400000);
      return { inicio, fim: fimHoje };
    }
    case "mes": {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
      return { inicio, fim };
    }
    case "personalizado": {
      const inicio = new Date(`${dataInicio}T00:00:00`);
      const fim = new Date(new Date(`${dataFim}T00:00:00`).getTime() + 86400000);
      return { inicio, fim };
    }
  }
}

function somarPreco(ags: { preco: unknown }[]): number {
  return ags.reduce((soma, a) => soma + Number(a.preco ?? 0), 0);
}

router.get("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ erro: "Query inválida.", detalhes: parsed.error.flatten() });
    return;
  }

  const { periodo, data_inicio, data_fim } = parsed.data;
  const { inicio, fim } = calcularIntervalo(periodo, data_inicio, data_fim);
  const duracao = fim.getTime() - inicio.getTime();
  const inicioAnterior = new Date(inicio.getTime() - duracao);
  const fimAnterior = inicio;

  const [
    concluidosAtual,
    totalAtual,
    canceladosAtual,
    naoCompareceramAtual,
    concluidosAnterior,
    totalAnterior,
    naoCompareceramAnterior,
  ] = await Promise.all([
    prisma.agendamento.findMany({
      where: { tenant_id: tenantId, status: "concluido", data_hora: { gte: inicio, lt: fim } },
      include: {
        servico: { select: { id: true, nome: true } },
        profissional: { select: { id: true, nome: true } },
      },
    }),
    prisma.agendamento.count({ where: { tenant_id: tenantId, data_hora: { gte: inicio, lt: fim } } }),
    prisma.agendamento.count({
      where: { tenant_id: tenantId, status: "cancelado", data_hora: { gte: inicio, lt: fim } },
    }),
    prisma.agendamento.count({
      where: { tenant_id: tenantId, status: "nao_compareceu", data_hora: { gte: inicio, lt: fim } },
    }),
    prisma.agendamento.findMany({
      where: { tenant_id: tenantId, status: "concluido", data_hora: { gte: inicioAnterior, lt: fimAnterior } },
      select: { preco: true },
    }),
    prisma.agendamento.count({
      where: { tenant_id: tenantId, data_hora: { gte: inicioAnterior, lt: fimAnterior } },
    }),
    prisma.agendamento.count({
      where: { tenant_id: tenantId, status: "nao_compareceu", data_hora: { gte: inicioAnterior, lt: fimAnterior } },
    }),
  ]);

  const receitaTotal = somarPreco(concluidosAtual);
  const receitaAnterior = somarPreco(concluidosAnterior);
  const ticketMedio = concluidosAtual.length > 0 ? receitaTotal / concluidosAtual.length : 0;
  const ticketMedioAnterior = concluidosAnterior.length > 0 ? receitaAnterior / concluidosAnterior.length : 0;

  const agruparTop = (chave: "servico" | "profissional") => {
    const mapa = new Map<string, { id: string; nome: string; quantidade: number; receita: number }>();
    for (const ag of concluidosAtual) {
      const entidade = ag[chave];
      const atual = mapa.get(entidade.id) ?? { id: entidade.id, nome: entidade.nome, quantidade: 0, receita: 0 };
      atual.quantidade += 1;
      atual.receita += Number(ag.preco ?? 0);
      mapa.set(entidade.id, atual);
    }
    return Array.from(mapa.values())
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  };

  const qtdDias = Math.max(Math.round(duracao / 86400000), 1);
  const receitaPorDia = Array.from({ length: qtdDias }, (_, i) => {
    const dia = new Date(inicio.getTime() + i * 86400000);
    const proximoDia = new Date(dia.getTime() + 86400000);
    const doDia = concluidosAtual.filter((a) => a.data_hora >= dia && a.data_hora < proximoDia);
    return { data: dia.toISOString().slice(0, 10), receita: somarPreco(doDia) };
  });

  // melhor avaliado do mês
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const fimMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  const avaliacoesMes = await prisma.avaliacao.findMany({
    where: { tenant_id: tenantId, created_at: { gte: inicioMes, lt: fimMes } },
    include: { profissional: { select: { id: true, nome: true } } },
  });

  let melhorAvaliado: { nome: string; media: number; total: number } | null = null;
  if (avaliacoesMes.length > 0) {
    const mapaAval: Record<string, { nome: string; notas: number[] }> = {};
    for (const a of avaliacoesMes) {
      const id = a.profissional.id;
      mapaAval[id] ??= { nome: a.profissional.nome, notas: [] };
      mapaAval[id].notas.push(a.nota);
    }
    const ordenado = Object.entries(mapaAval)
      .map(([, v]) => ({ nome: v.nome, media: v.notas.reduce((s, n) => s + n, 0) / v.notas.length, total: v.notas.length }))
      .sort((a, b) => b.media - a.media);
    if (ordenado[0]) melhorAvaliado = { ...ordenado[0], media: Math.round(ordenado[0].media * 10) / 10 };
  }

  res.json({
    receita: { total: receitaTotal, periodoAnterior: receitaAnterior },
    agendamentos: {
      total: totalAtual,
      concluidos: concluidosAtual.length,
      cancelados: canceladosAtual,
      naoCompareceram: naoCompareceramAtual,
      totalPeriodoAnterior: totalAnterior,
      naoCompareceramPeriodoAnterior: naoCompareceramAnterior,
    },
    ticketMedio,
    ticketMedioPeriodoAnterior: ticketMedioAnterior,
    topServicos: agruparTop("servico"),
    topProfissionais: agruparTop("profissional"),
    receitaPorDia,
    melhorAvaliado,
  });
});

export default router;
