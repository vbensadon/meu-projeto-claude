import { Router, type Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";
import { cancelarAgendamento } from "../services/agendamentoService";
import { criarEventoCalendar, atualizarEventoCalendar } from "../services/calendarService";
import { upsertCliente } from "../services/clienteService";
import { gerarTokenAvaliacao } from "./avaliar";
import { enviarMensagem } from "../services/twilioService";
import { calcularERegistrarComissao } from "../services/comissaoService";

const router = Router();
router.use(autenticar);

const QuerySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  profissional_id: z.string().optional(),
  status: z.enum(["pendente", "confirmado", "cancelado", "concluido", "nao_compareceu"]).optional(),
});

const AgendamentoManualSchema = z.object({
  profissional_id: z.string().min(1),
  servico_id: z.string().min(1),
  cliente_nome: z.string().min(1).max(150),
  cliente_telefone: z.string().min(1),
  data_hora: z.string().datetime(),
});

router.get("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ erro: "Query inválida.", detalhes: parsed.error.flatten() });
    return;
  }

  const { data, status } = parsed.data;
  // Barbeiro só vê a própria agenda
  const profissional_id = req.profissionalId ?? parsed.data.profissional_id;

  const where: Prisma.AgendamentoWhereInput = {
    tenant_id: tenantId,
    ...(profissional_id && { profissional_id }),
    ...(status && { status }),
    ...(data && {
      data_hora: {
        gte: new Date(`${data}T00:00:00`),
        lte: new Date(`${data}T23:59:59`),
      },
    }),
  };

  const agendamentos = await prisma.agendamento.findMany({
    where,
    include: {
      profissional: { select: { id: true, nome: true } },
      servico: { select: { id: true, nome: true, duracao_minutos: true, preco: true } },
    },
    orderBy: { data_hora: "asc" },
  });

  res.json(agendamentos);
});

router.post("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = AgendamentoManualSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const { profissional_id, servico_id, cliente_nome, cliente_telefone, data_hora } = parsed.data;

  const [profissional, servico] = await Promise.all([
    prisma.profissional.findFirst({ where: { id: profissional_id, tenant_id: tenantId } }),
    prisma.servico.findFirst({ where: { id: servico_id, tenant_id: tenantId } }),
  ]);

  if (!profissional) { res.status(404).json({ erro: "Profissional não encontrado." }); return; }
  if (!servico) { res.status(404).json({ erro: "Serviço não encontrado." }); return; }

  const novoInicio = new Date(data_hora);
  const novoFim = new Date(novoInicio.getTime() + servico.duracao_minutos * 60_000);
  const inicioDia = new Date(novoInicio.toDateString());
  const fimDia = new Date(inicioDia.getTime() + 86400000);

  const agendamentosDoDia = await prisma.agendamento.findMany({
    where: {
      tenant_id: tenantId,
      profissional_id,
      status: { not: "cancelado" },
      data_hora: { gte: inicioDia, lt: fimDia },
    },
    include: { servico: { select: { duracao_minutos: true } } },
  });

  const temConflito = agendamentosDoDia.some((a) => {
    const fim = new Date(a.data_hora.getTime() + a.servico.duracao_minutos * 60_000);
    return novoInicio < fim && novoFim > a.data_hora;
  });

  if (temConflito) {
    res.status(409).json({ erro: "Horário indisponível." });
    return;
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const calendarId = profissional.google_calendar_id ?? tenant.google_calendar_id_dono;
  const googleEventId = await criarEventoCalendar(
    tenantId,
    calendarId,
    `${servico.nome} — ${cliente_nome}`,
    novoInicio,
    servico.duracao_minutos,
    `Cliente: ${cliente_nome} | Tel: ${cliente_telefone}`
  );

  const agendamento = await prisma.agendamento.create({
    data: {
      tenant_id: tenantId,
      profissional_id,
      servico_id,
      cliente_nome,
      cliente_telefone,
      data_hora: novoInicio,
      status: "confirmado",
      preco: servico.preco,
      google_event_id: googleEventId,
    },
    include: {
      profissional: { select: { id: true, nome: true } },
      servico: { select: { id: true, nome: true, duracao_minutos: true, preco: true } },
    },
  });

  upsertCliente(tenantId, cliente_nome, cliente_telefone, "manual").catch((e) =>
    console.error("[CRM] Falha ao upsert cliente:", e)
  );

  res.status(201).json(agendamento);
});

const AgendamentoEditSchema = z
  .object({
    profissional_id: z.string().min(1).optional(),
    servico_id: z.string().min(1).optional(),
    cliente_nome: z.string().min(1).max(150).optional(),
    cliente_telefone: z.string().min(1).optional(),
    data_hora: z.string().datetime().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Informe ao menos um campo." });

router.patch("/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = AgendamentoEditSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const existente = await prisma.agendamento.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!existente) { res.status(404).json({ erro: "Agendamento não encontrado." }); return; }
  if (existente.status === "cancelado") {
    res.status(400).json({ erro: "Não é possível editar um agendamento cancelado." });
    return;
  }

  const profissionalId = parsed.data.profissional_id ?? existente.profissional_id;
  const servicoId = parsed.data.servico_id ?? existente.servico_id;
  const novoInicio = parsed.data.data_hora ? new Date(parsed.data.data_hora) : existente.data_hora;

  const [profissional, servico, tenant] = await Promise.all([
    prisma.profissional.findFirst({ where: { id: profissionalId, tenant_id: tenantId } }),
    prisma.servico.findFirst({ where: { id: servicoId, tenant_id: tenantId } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);

  if (!profissional) { res.status(404).json({ erro: "Profissional não encontrado." }); return; }
  if (!servico) { res.status(404).json({ erro: "Serviço não encontrado." }); return; }

  const novoFim = new Date(novoInicio.getTime() + servico.duracao_minutos * 60_000);
  const inicioDia = new Date(novoInicio.toDateString());
  const fimDia = new Date(inicioDia.getTime() + 86400000);

  const agendamentosDoDia = await prisma.agendamento.findMany({
    where: {
      tenant_id: tenantId,
      profissional_id: profissionalId,
      status: { not: "cancelado" },
      id: { not: existente.id },
      data_hora: { gte: inicioDia, lt: fimDia },
    },
    include: { servico: { select: { duracao_minutos: true } } },
  });

  const temConflito = agendamentosDoDia.some((a) => {
    const fim = new Date(a.data_hora.getTime() + a.servico.duracao_minutos * 60_000);
    return novoInicio < fim && novoFim > a.data_hora;
  });

  if (temConflito) {
    res.status(409).json({ erro: "Horário indisponível." });
    return;
  }

  const calendarId = profissional.google_calendar_id ?? tenant.google_calendar_id_dono;
  await atualizarEventoCalendar(tenantId, calendarId, existente.google_event_id, novoInicio, servico.duracao_minutos);

  const atualizado = await prisma.agendamento.update({
    where: { id: existente.id },
    data: {
      profissional_id: profissionalId,
      servico_id: servicoId,
      cliente_nome: parsed.data.cliente_nome ?? existente.cliente_nome,
      cliente_telefone: parsed.data.cliente_telefone ?? existente.cliente_telefone,
      data_hora: novoInicio,
      ...(parsed.data.servico_id && { preco: servico.preco }),
    },
    include: {
      profissional: { select: { id: true, nome: true } },
      servico: { select: { id: true, nome: true, duracao_minutos: true, preco: true } },
    },
  });

  res.json(atualizado);
});

const DashboardQuerySchema = z.object({
  profissional_id: z.string().optional(),
});

router.get("/dashboard", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsedQuery = DashboardQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ erro: "Query inválida.", detalhes: parsedQuery.error.flatten() });
    return;
  }
  const { profissional_id } = parsedQuery.data;
  const filtroProfissional = profissional_id ? { profissional_id } : {};

  const hoje = new Date();
  const inicioHoje = new Date(hoje.toDateString());
  const fimHoje = new Date(inicioHoje.getTime() + 86400000);
  const em7Dias = new Date(inicioHoje);
  em7Dias.setDate(em7Dias.getDate() + 7);
  const em14Dias = new Date(inicioHoje);
  em14Dias.setDate(em14Dias.getDate() + 14);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

  const [totalHoje, proximos, totalMes, confirmadosHoje, confirmadosMes, confirmadosSemana, confirmados14Dias] =
    await Promise.all([
      prisma.agendamento.count({
        where: { tenant_id: tenantId, ...filtroProfissional, data_hora: { gte: inicioHoje, lt: fimHoje }, status: { not: "cancelado" } },
      }),
      prisma.agendamento.findMany({
        where: { tenant_id: tenantId, ...filtroProfissional, data_hora: { gte: hoje, lte: em7Dias }, status: { not: "cancelado" } },
        include: {
          profissional: { select: { nome: true } },
          servico: { select: { nome: true } },
        },
        orderBy: { data_hora: "asc" },
        take: 10,
      }),
      prisma.agendamento.count({
        where: { tenant_id: tenantId, ...filtroProfissional, data_hora: { gte: inicioMes, lt: fimMes }, status: { not: "cancelado" } },
      }),
      prisma.agendamento.findMany({
        where: { tenant_id: tenantId, ...filtroProfissional, status: "confirmado", data_hora: { gte: inicioHoje, lt: fimHoje } },
        include: { servico: { select: { preco: true } } },
      }),
      prisma.agendamento.findMany({
        where: { tenant_id: tenantId, ...filtroProfissional, status: "confirmado", data_hora: { gte: inicioMes, lt: fimMes } },
        include: { servico: { select: { preco: true } } },
      }),
      prisma.agendamento.findMany({
        where: { tenant_id: tenantId, ...filtroProfissional, status: "confirmado", data_hora: { gte: hoje, lte: em7Dias } },
        include: { servico: { select: { preco: true } } },
      }),
      prisma.agendamento.findMany({
        where: { tenant_id: tenantId, ...filtroProfissional, status: "confirmado", data_hora: { gte: inicioHoje, lt: em14Dias } },
        include: { servico: { select: { preco: true } } },
      }),
    ]);

  const somarReceita = (ags: { servico: { preco: Prisma.Decimal } }[]) =>
    ags.reduce((soma, a) => soma + Number(a.servico.preco), 0);

  const agendamentosPorDia = Array.from({ length: 14 }, (_, i) => {
    const dia = new Date(inicioHoje);
    dia.setDate(dia.getDate() + i);
    const proximoDia = new Date(dia.getTime() + 86400000);
    const doDia = confirmados14Dias.filter((a) => a.data_hora >= dia && a.data_hora < proximoDia);
    return { data: dia.toISOString().slice(0, 10), total: doDia.length, receita: somarReceita(doDia) };
  });

  res.json({
    totalHoje,
    totalMes,
    proximos,
    receitaConfirmadaHoje: somarReceita(confirmadosHoje),
    receitaConfirmadaMes: somarReceita(confirmadosMes),
    receitaProjetadaSemana: somarReceita(confirmadosSemana),
    agendamentosPorDia,
  });
});

const StatusUpdateSchema = z.object({
  status: z.enum(["confirmado", "concluido", "nao_compareceu"]),
});

router.patch("/:id/status", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = StatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const existente = await prisma.agendamento.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!existente) { res.status(404).json({ erro: "Agendamento não encontrado." }); return; }
  if (existente.status === "cancelado") {
    res.status(400).json({ erro: "Não é possível alterar o status de um agendamento cancelado." });
    return;
  }

  const atualizado = await prisma.agendamento.update({
    where: { id: existente.id },
    data: { status: parsed.data.status },
    include: {
      profissional: { select: { id: true, nome: true } },
      servico: { select: { id: true, nome: true, duracao_minutos: true, preco: true } },
    },
  });

  if (parsed.data.status === "concluido") {
    (async () => {
      try {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) return;
        const token = gerarTokenAvaliacao(existente.id, tenantId);
        const appUrl = process.env.APP_URL ?? "http://localhost:5173";
        const link = `${appUrl}/avaliar/${existente.id}/${token}`;
        const mensagem =
          `Obrigado pela visita, ${existente.cliente_nome}! 😊\n` +
          `Como foi seu atendimento com ${atualizado.profissional.nome}?\n` +
          `Avalie em: ${link}`;
        await enviarMensagem(
          { accountSid: tenant.twilio_account_sid, authToken: tenant.twilio_auth_token, numeroOrigem: tenant.telefone_whatsapp },
          existente.cliente_telefone,
          mensagem
        );
      } catch (err) {
        console.error("[Avaliação] Erro ao enviar link:", err);
      }
    })();

    // Registrar lançamento de comissão
    const valorBruto = Number(atualizado.servico.preco);
    calcularERegistrarComissao(
      tenantId,
      existente.id,
      existente.profissional_id,
      existente.servico_id,
      valorBruto
    ).catch((err) => console.error("[Comissão] Erro ao registrar lançamento:", err));
  }

  res.json(atualizado);
});

router.patch("/:id/cancelar", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;

  const existente = await prisma.agendamento.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!existente) { res.status(404).json({ erro: "Agendamento não encontrado." }); return; }
  if (existente.status === "cancelado") {
    res.status(400).json({ erro: "Agendamento já cancelado." });
    return;
  }

  try {
    await cancelarAgendamento(req.params.id);
    res.json({ mensagem: "Agendamento cancelado com sucesso." });
  } catch (err) {
    console.error("[Agendamentos] Erro ao cancelar:", err);
    res.status(500).json({ erro: "Erro ao cancelar agendamento." });
  }
});

export default router;
