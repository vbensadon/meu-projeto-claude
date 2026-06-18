import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";
import { enviarMensagem } from "../services/twilioService";
import { resolverSegmento, contarSegmento, executarCampanha, type Segmento } from "../services/campanhaService";

const router = Router();
router.use(autenticar);

const RATE_LIMIT_INTERVALO_MS = 6000;

const EnviarDiretoSchema = z.object({
  clienteIds: z.array(z.string().min(1)).min(1).max(200),
  mensagem: z.string().min(1).max(1000),
});

const CriarCampanhaSchema = z.object({
  nome: z.string().min(1).max(200),
  segmento: z.enum(["todos", "inativos_30", "inativos_60", "aniversariantes_mes", "vip"]),
  mensagem: z.string().min(1).max(1000),
  agendado_para: z.string().datetime().optional().nullable(),
});

const CountQuerySchema = z.object({
  segmento: z.enum(["todos", "inativos_30", "inativos_60", "aniversariantes_mes", "vip"]),
});

// Envio direto por IDs (Feature 7 — mantido)
router.post("/whatsapp", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = EnviarDiretoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const { clienteIds, mensagem } = parsed.data;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) { res.status(404).json({ erro: "Tenant não encontrado." }); return; }

  const clientes = await prisma.cliente.findMany({
    where: { id: { in: clienteIds }, tenant_id: tenantId },
    select: { id: true, nome: true, telefone: true },
  });
  if (clientes.length === 0) { res.status(400).json({ erro: "Nenhum cliente válido encontrado." }); return; }

  res.json({ enviando: true, total: clientes.length });

  const creds = { accountSid: tenant.twilio_account_sid, authToken: tenant.twilio_auth_token, numeroOrigem: tenant.telefone_whatsapp };
  let enviados = 0, falhas = 0;
  for (const cliente of clientes) {
    const texto = mensagem.replace(/\{nome\}/g, cliente.nome);
    let status = "enviado";
    let erro: string | undefined;
    try { await enviarMensagem(creds, cliente.telefone, texto); enviados++; }
    catch (err) { status = "falhou"; erro = String(err instanceof Error ? err.message : err).slice(0, 500); falhas++; }
    await prisma.logCampanha.create({ data: { tenant_id: tenantId, cliente_id: cliente.id, mensagem: texto, status, erro: erro ?? null } });
    if (enviados + falhas < clientes.length) await new Promise((r) => setTimeout(r, RATE_LIMIT_INTERVALO_MS));
  }
});

// Contar destinatários de um segmento
router.get("/count", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = CountQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ erro: "Segmento inválido." }); return; }
  try {
    const total = await contarSegmento(tenantId, parsed.data.segmento as Segmento);
    res.json({ total });
  } catch (err) {
    console.error("[Campanhas] Erro ao contar segmento:", err);
    res.status(500).json({ erro: "Erro ao contar segmento." });
  }
});

// Listar campanhas
router.get("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  try {
    const campanhas = await prisma.campanha.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: "desc" },
      select: {
        id: true, nome: true, segmento: true, mensagem: true,
        agendado_para: true, enviado_em: true, status: true,
        total_enviados: true, total_falhas: true, created_at: true,
        _count: { select: { logs: true } },
      },
    });
    res.json({ campanhas });
  } catch (err) {
    console.error("[Campanhas] Erro ao listar:", err);
    res.status(500).json({ erro: "Erro ao listar campanhas." });
  }
});

// Criar campanha
router.post("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = CriarCampanhaSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() }); return; }

  const { nome, segmento, mensagem, agendado_para } = parsed.data;
  const status = agendado_para ? "agendada" : "rascunho";

  try {
    const campanha = await prisma.campanha.create({
      data: {
        tenant_id: tenantId,
        nome,
        segmento,
        mensagem,
        agendado_para: agendado_para ? new Date(agendado_para) : null,
        status,
      },
    });

    // Envio imediato se não for agendado
    if (!agendado_para) {
      (async () => { try { await executarCampanha(campanha.id); } catch (e) { console.error("[Campanhas] Erro ao executar:", e); } })();
    }

    res.status(201).json({ campanha });
  } catch (err) {
    console.error("[Campanhas] Erro ao criar:", err);
    res.status(500).json({ erro: "Erro ao criar campanha." });
  }
});

// Disparar campanha agendada (ou rascunho) imediatamente
router.post("/:id/enviar", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const campanha = await prisma.campanha.findUnique({ where: { id: req.params.id } });
  if (!campanha || campanha.tenant_id !== tenantId) { res.status(404).json({ erro: "Campanha não encontrada." }); return; }
  if (campanha.status === "enviando" || campanha.status === "concluida") {
    res.status(409).json({ erro: "Campanha já foi enviada ou está em andamento." });
    return;
  }

  res.json({ iniciando: true });
  (async () => { try { await executarCampanha(campanha.id); } catch (e) { console.error("[Campanhas] Erro ao enviar:", e); } })();
});

// Logs de uma campanha
router.get("/:id/logs", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const campanha = await prisma.campanha.findUnique({ where: { id: req.params.id } });
  if (!campanha || campanha.tenant_id !== tenantId) { res.status(404).json({ erro: "Campanha não encontrada." }); return; }

  try {
    const logs = await prisma.logCampanha.findMany({
      where: { campanha_id: req.params.id },
      orderBy: { enviado_em: "asc" },
      select: { id: true, cliente_id: true, mensagem: true, status: true, erro: true, enviado_em: true },
    });
    const clienteIds = [...new Set(logs.map((l) => l.cliente_id))];
    const clientes = await prisma.cliente.findMany({
      where: { id: { in: clienteIds } },
      select: { id: true, nome: true, telefone: true },
    });
    const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));
    const resultado = logs.map((l) => ({ ...l, cliente: clienteMap[l.cliente_id] ?? null }));
    res.json({ logs: resultado, total: logs.length });
  } catch (err) {
    console.error("[Campanhas] Erro ao buscar logs:", err);
    res.status(500).json({ erro: "Erro ao buscar logs." });
  }
});

// Detalhe da campanha com contagem de destinatários
router.get("/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  try {
    const campanha = await prisma.campanha.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { logs: true } } },
    });
    if (!campanha || campanha.tenant_id !== tenantId) { res.status(404).json({ erro: "Campanha não encontrada." }); return; }

    const totalDestinatarios = await contarSegmento(tenantId, campanha.segmento as Segmento);
    res.json({ campanha: { ...campanha, totalDestinatarios } });
  } catch (err) {
    console.error("[Campanhas] Erro ao buscar campanha:", err);
    res.status(500).json({ erro: "Erro ao buscar campanha." });
  }
});

export default router;
