import { Router, type Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { autenticar, requireRole } from "../middlewares/auth";

const router = Router();
router.use(autenticar);
router.use(requireRole("dono", "gerente"));

const MES_REGEX = /^\d{4}-\d{2}$/;

function periodoDoMes(mes: string): { inicio: Date; fim: Date } {
  const [ano, mesNum] = mes.split("-").map(Number);
  const inicio = new Date(ano, mesNum - 1, 1);
  const fim = new Date(ano, mesNum, 1);
  return { inicio, fim };
}

function mesAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

// ─── RELATÓRIO LEGADO (mantido para compatibilidade) ──────────────────────────

const ListarQuerySchema = z.object({
  mes: z.string().regex(MES_REGEX).optional(),
  profissional_id: z.string().optional(),
});

router.get("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = ListarQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ erro: "Query inválida.", detalhes: parsed.error.flatten() });
    return;
  }
  const mes = parsed.data.mes ?? mesAtual();
  const { inicio, fim } = periodoDoMes(mes);
  const profissionais = await prisma.profissional.findMany({
    where: { tenant_id: tenantId, ativo: true, ...(parsed.data.profissional_id && { id: parsed.data.profissional_id }) },
    orderBy: { nome: "asc" },
  });
  const resultado = await Promise.all(
    profissionais.map(async (prof) => {
      const ags = await prisma.agendamento.findMany({
        where: { tenant_id: tenantId, profissional_id: prof.id, status: "confirmado", data_hora: { gte: inicio, lt: fim } },
        include: { servico: { select: { preco: true } } },
      });
      const atendimentos = ags.length;
      const receita = ags.reduce((s, a) => s + Number(a.servico.preco), 0);
      const percentual = Number(prof.comissao_percentual);
      const comissaoValor = (receita * percentual) / 100;
      const pagamento = await prisma.comissaoPagamento.findUnique({
        where: { profissional_id_periodo_inicio_periodo_fim: { profissional_id: prof.id, periodo_inicio: inicio, periodo_fim: fim } },
      });
      return {
        profissional: { id: prof.id, nome: prof.nome }, mes, atendimentos, receita,
        comissao_percentual: percentual, comissao_valor: comissaoValor,
        pago: !!pagamento, valor_pago: pagamento ? Number(pagamento.valor_pago) : null,
        pago_em: pagamento ? pagamento.pago_em.toISOString() : null,
      };
    })
  );
  res.json(resultado);
});

// ─── RELATÓRIO DETALHADO (usa LancamentoComissao) ─────────────────────────────

router.get("/relatorio", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const mes = typeof req.query.mes === "string" && MES_REGEX.test(req.query.mes) ? req.query.mes : mesAtual();
  const { inicio, fim } = periodoDoMes(mes);
  try {
    const profissionais = await prisma.profissional.findMany({
      where: { tenant_id: tenantId, ativo: true },
      orderBy: { nome: "asc" },
    });
    const relatorio = await Promise.all(
      profissionais.map(async (prof) => {
        const lancamentos = await prisma.lancamentoComissao.findMany({
          where: { tenant_id: tenantId, profissional_id: prof.id, created_at: { gte: inicio, lt: fim } },
          include: {
            agendamento: { select: { cliente_nome: true, data_hora: true } },
            regra: { select: { tipo: true, valor: true } },
          },
          orderBy: { created_at: "asc" },
        });
        const totalAtendimentos = lancamentos.length;
        const receitaBruta = lancamentos.reduce((s, l) => s + Number(l.valor_bruto), 0);
        const totalComissao = lancamentos.reduce((s, l) => s + Number(l.comissao_valor), 0);
        const pctMedio = totalAtendimentos > 0
          ? lancamentos.reduce((s, l) => s + Number(l.comissao_percentual), 0) / totalAtendimentos
          : Number(prof.comissao_percentual);
        const totalPago = lancamentos.filter((l) => l.pago_em).reduce((s, l) => s + Number(l.comissao_valor), 0);
        const pagamento = await prisma.comissaoPagamento.findUnique({
          where: { profissional_id_periodo_inicio_periodo_fim: { profissional_id: prof.id, periodo_inicio: inicio, periodo_fim: fim } },
        });
        return {
          profissional: { id: prof.id, nome: prof.nome }, mes,
          total_atendimentos: totalAtendimentos, receita_bruta: receitaBruta, pct_medio: pctMedio,
          total_comissao: totalComissao, total_pago: totalPago, total_pendente: totalComissao - totalPago,
          pago: !!pagamento, pago_em: pagamento ? pagamento.pago_em.toISOString() : null,
          lancamentos: lancamentos.map((l) => ({
            id: l.id, data: l.agendamento.data_hora.toISOString(), cliente: l.agendamento.cliente_nome,
            valor_bruto: Number(l.valor_bruto), comissao_percentual: Number(l.comissao_percentual),
            comissao_valor: Number(l.comissao_valor), tipo_regra: l.regra?.tipo ?? "percentual",
            pago: !!l.pago_em, pago_em: l.pago_em?.toISOString() ?? null,
          })),
        };
      })
    );
    res.json({ relatorio, mes });
  } catch (err) {
    console.error("[Comissoes] Erro ao gerar relatorio:", err);
    res.status(500).json({ erro: "Erro ao gerar relatório." });
  }
});

// ─── PAGAR ─────────────────────────────────────────────────────────────────────

const PagarSchema = z.object({
  profissional_id: z.string().min(1),
  mes: z.string().regex(MES_REGEX),
});

router.post("/pagar", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = PagarSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() }); return; }
  const { profissional_id, mes } = parsed.data;
  const { inicio, fim } = periodoDoMes(mes);
  const profissional = await prisma.profissional.findFirst({ where: { id: profissional_id, tenant_id: tenantId } });
  if (!profissional) { res.status(404).json({ erro: "Profissional não encontrado." }); return; }
  const ags = await prisma.agendamento.findMany({
    where: { tenant_id: tenantId, profissional_id, status: "confirmado", data_hora: { gte: inicio, lt: fim } },
    include: { servico: { select: { preco: true } } },
  });
  const receita = ags.reduce((s, a) => s + Number(a.servico.preco), 0);
  const percentual = Number(profissional.comissao_percentual);
  const valorPago = (receita * percentual) / 100;
  try {
    const pagamento = await prisma.comissaoPagamento.create({
      data: { tenant_id: tenantId, profissional_id, periodo_inicio: inicio, periodo_fim: fim, receita_base: receita, percentual, valor_pago: valorPago },
    });
    await prisma.lancamentoComissao.updateMany({
      where: { tenant_id: tenantId, profissional_id, created_at: { gte: inicio, lt: fim }, pago_em: null },
      data: { pago_em: new Date() },
    });
    res.status(201).json({ pago: true, valor_pago: Number(pagamento.valor_pago), pago_em: pagamento.pago_em.toISOString() });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ erro: "Comissão deste período já foi marcada como paga." }); return;
    }
    throw err;
  }
});

// ─── REGRAS ────────────────────────────────────────────────────────────────────

const RegraSchema = z.object({
  profissional_id: z.string().min(1),
  servico_id: z.string().optional().nullable(),
  tipo: z.enum(["percentual", "fixo"]),
  valor: z.number().positive(),
});

router.get("/regras", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  try {
    const regras = await prisma.regraComissao.findMany({
      where: { tenant_id: tenantId },
      include: {
        profissional: { select: { id: true, nome: true } },
        servico: { select: { id: true, nome: true } },
      },
      orderBy: [{ profissional: { nome: "asc" } }, { servico_id: "asc" }],
    });
    res.json({ regras });
  } catch (err) {
    console.error("[Comissoes] Erro ao listar regras:", err);
    res.status(500).json({ erro: "Erro ao listar regras." });
  }
});

router.post("/regras", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = RegraSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() }); return; }
  const { profissional_id, servico_id, tipo, valor } = parsed.data;
  const profissional = await prisma.profissional.findFirst({ where: { id: profissional_id, tenant_id: tenantId } });
  if (!profissional) { res.status(404).json({ erro: "Profissional não encontrado." }); return; }
  if (servico_id) {
    const servico = await prisma.servico.findFirst({ where: { id: servico_id, tenant_id: tenantId } });
    if (!servico) { res.status(404).json({ erro: "Serviço não encontrado." }); return; }
  }
  try {
    const existente = await prisma.regraComissao.findFirst({
      where: { tenant_id: tenantId, profissional_id, servico_id: servico_id ?? null },
    });
    if (existente) {
      const regra = await prisma.regraComissao.update({
        where: { id: existente.id }, data: { tipo, valor },
        include: { profissional: { select: { id: true, nome: true } }, servico: { select: { id: true, nome: true } } },
      });
      res.json({ regra });
    } else {
      const regra = await prisma.regraComissao.create({
        data: { tenant_id: tenantId, profissional_id, servico_id: servico_id ?? null, tipo, valor },
        include: { profissional: { select: { id: true, nome: true } }, servico: { select: { id: true, nome: true } } },
      });
      res.status(201).json({ regra });
    }
  } catch (err) {
    console.error("[Comissoes] Erro ao criar regra:", err);
    res.status(500).json({ erro: "Erro ao criar regra." });
  }
});

router.delete("/regras/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const regra = await prisma.regraComissao.findUnique({ where: { id: req.params.id } });
  if (!regra || regra.tenant_id !== tenantId) { res.status(404).json({ erro: "Regra não encontrada." }); return; }
  await prisma.regraComissao.delete({ where: { id: req.params.id } });
  res.json({ mensagem: "Regra removida." });
});

export default router;
