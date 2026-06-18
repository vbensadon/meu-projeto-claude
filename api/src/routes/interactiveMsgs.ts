import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { autenticar, requireRole } from "../middlewares/auth";

const router = Router();
router.use(autenticar);

// Textos padrão por etapa (usado quando o tenant não customizou)
const DEFAULTS: Record<string, { corpo_texto: string; labels_botoes: string[] }> = {
  BOAS_VINDAS:             { corpo_texto: "Olá! Bem-vindo ao agendamento 😊\n\nEscolha o serviço:", labels_botoes: [] },
  ESCOLHA_SERVICO:         { corpo_texto: "Opção inválida. Por favor, escolha um serviço:", labels_botoes: [] },
  ESCOLHA_PROFISSIONAL:    { corpo_texto: "Ótimo! Você escolheu *{serviceName}*.\n\nAgora, escolha o profissional:", labels_botoes: [] },
  ESCOLHA_DATA:            { corpo_texto: "Perfeito! *{barberName}* selecionado.\n\nQual data você prefere?", labels_botoes: ["Hoje", "Amanhã", "Outra data"] },
  ESCOLHA_HORARIO:         { corpo_texto: "Horários disponíveis em *{date}*:", labels_botoes: [] },
  FILA_ESPERA_PROMPT:      { corpo_texto: "Não há horários disponíveis em {date} com {barberName}.\n\nDeseja entrar na fila de espera?", labels_botoes: ["Sim, entrar na fila", "Não, obrigado"] },
  CONFIRMACAO_AGENDAMENTO: { corpo_texto: "Confirme seu agendamento:\n\n📋 *Serviço:* {serviceName}\n👤 *Profissional:* {barberName}\n📅 *Data:* {date}\n🕐 *Horário:* {time}", labels_botoes: ["✅ Confirmar", "❌ Cancelar"] },
  LEMBRETE:                { corpo_texto: "Olá, {clientName}! 👋\nLembrando do seu agendamento amanhã:\n📅 {date} às {time}\n✂️ {serviceName} com {barberName}", labels_botoes: ["Confirmar", "Cancelar"] },
  VAGA_FILA_ESPERA:        { corpo_texto: "🎉 Boa notícia, {clientName}!\n\nAbriu um horário em *{date}* com *{barberName}* para *{serviceName}*.\n\nResponda para iniciar um novo agendamento.", labels_botoes: [] },
};

// Variáveis disponíveis por etapa
const VARIAVEIS: Record<string, string[]> = {
  BOAS_VINDAS:             [],
  ESCOLHA_SERVICO:         [],
  ESCOLHA_PROFISSIONAL:    ["{serviceName}"],
  ESCOLHA_DATA:            ["{barberName}"],
  ESCOLHA_HORARIO:         ["{date}"],
  FILA_ESPERA_PROMPT:      ["{date}", "{barberName}"],
  CONFIRMACAO_AGENDAMENTO: ["{serviceName}", "{barberName}", "{date}", "{time}"],
  LEMBRETE:                ["{clientName}", "{date}", "{time}", "{serviceName}", "{barberName}"],
  VAGA_FILA_ESPERA:        ["{clientName}", "{date}", "{barberName}", "{serviceName}"],
};

// GET / — lista config de todas as etapas (com defaults mesclados)
router.get("/", async (req, res) => {
  try {
    const configs = await prisma.interactiveMessageConfig.findMany({
      where: { tenant_id: req.tenantId },
    });

    const indexado = Object.fromEntries(configs.map((c) => [c.etapa, c]));

    const resultado = Object.keys(DEFAULTS).map((etapa) => {
      const custom = indexado[etapa];
      return {
        etapa,
        corpo_texto: custom?.corpo_texto ?? DEFAULTS[etapa].corpo_texto,
        formato: custom?.formato ?? "AUTOMATICO",
        labels_botoes: custom?.labels_botoes ?? DEFAULTS[etapa].labels_botoes,
        ativo: custom?.ativo ?? true,
        customizado: !!custom,
        variaveis_disponiveis: VARIAVEIS[etapa] ?? [],
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao buscar configurações." });
  }
});

const schemaUpdate = z.object({
  corpo_texto: z.string().min(1).max(1024),
  formato: z.enum(["AUTOMATICO", "QUICK_REPLY", "LISTA", "TEXTO"]).optional(),
  labels_botoes: z.array(z.string().max(20)).max(3).optional(),
  ativo: z.boolean().optional(),
});

// PUT /:etapa — upsert config de uma etapa
router.put("/:etapa", requireRole("dono"), async (req, res) => {
  const { etapa } = req.params;

  if (!Object.keys(DEFAULTS).includes(etapa)) {
    res.status(400).json({ erro: "Etapa inválida." });
    return;
  }

  const parsed = schemaUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  try {
    const config = await prisma.interactiveMessageConfig.upsert({
      where: { tenant_id_etapa: { tenant_id: req.tenantId, etapa: etapa as any } },
      update: { ...parsed.data },
      create: {
        tenant_id: req.tenantId,
        etapa: etapa as any,
        corpo_texto: parsed.data.corpo_texto,
        formato: (parsed.data.formato as any) ?? "AUTOMATICO",
        labels_botoes: (parsed.data.labels_botoes ?? []) as any,
        ativo: parsed.data.ativo ?? true,
      },
    });
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao salvar configuração." });
  }
});

// DELETE /:etapa — volta ao padrão removendo a customização
router.delete("/:etapa", requireRole("dono"), async (req, res) => {
  const { etapa } = req.params;
  try {
    await prisma.interactiveMessageConfig.deleteMany({
      where: { tenant_id: req.tenantId, etapa: etapa as any },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao restaurar padrão." });
  }
});

export default router;
