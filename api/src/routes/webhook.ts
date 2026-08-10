import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { obterSessao, atualizarSessao, resetarSessao } from "../services/sessaoService";
import { marcarMensagemRecebida } from "../whatsapp/sessionWindow";
import { parsePayload, isStructuredPayload } from "../whatsapp/payloadParser";
import { sendInteractiveMessage } from "../whatsapp/interactiveMessenger";
import { processarMensagem } from "../services/stateMachine";
import { enviarMensagem, extrairNumero } from "../services/twilioService";
import { tratarRespostaLembrete } from "../services/lembreteService";
import type { DadosColetados, Etapa } from "../lib/types";
import { incrementMetric } from "../platform/services/usageMetrics";
import {
  getOrCreateConversation,
  addMessage,
  updateConversationStep,
  completeConversation,
} from "../platform/services/conversationService";

const router = Router();

async function persistirWebhookEvent(source: string, eventId: string | null, tenantId: string | null, payload: Record<string, string>) {
  // Idempotência: se já existe com mesmo source+eventId, não duplica
  if (eventId) {
    const existing = await prisma.webhookEvent.findUnique({
      where: { source_eventId: { source, eventId } },
    });
    if (existing) return existing;
  }
  return prisma.webhookEvent.create({
    data: {
      tenantId,
      source,
      eventId,
      payload: payload as object,
      status: "RECEIVED",
      attempts: 1,
    },
  });
}

async function marcarWebhookProcessado(id: string) {
  await prisma.webhookEvent.update({
    where: { id },
    data: { status: "PROCESSED", processedAt: new Date() },
  }).catch(() => { /* ignora se o evento não foi criado */ });
}

async function marcarWebhookFalhou(id: string, erro: string) {
  await prisma.webhookEvent.update({
    where: { id },
    data: {
      status: "FAILED",
      lastError: erro.slice(0, 500),
      attempts: { increment: 1 },
    },
  }).catch(() => { /* ignora */ });
}

router.post("/:tenantSlug", async (req: Request, res: Response): Promise<void> => {
  // Twilio espera HTTP 200 imediatamente
  res.sendStatus(200);

  const { tenantSlug } = req.params;
  const body = req.body as Record<string, string>;
  const remetenteRaw = body.From ?? "";
  const clienteTelefone = extrairNumero(remetenteRaw);

  const buttonPayload = (body.ButtonPayload ?? "").trim();
  const bodyTexto = (body.Body ?? "").trim();
  const mensagem = buttonPayload || bodyTexto;

  if (!mensagem || !clienteTelefone) return;

  if (buttonPayload) {
    const parsed = parsePayload(buttonPayload);
    console.log(`[Webhook] botão clicado: type=${parsed.type} value=${parsed.value} de ${clienteTelefone}`);
  }

  // Persistir evento bruto ANTES de processar
  const messageSid = body.MessageSid ?? null;
  let webhookEventId = "";
  let tenantIdForEvent: string | null = null;

  try {
    const tenantPreview = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    tenantIdForEvent = tenantPreview?.id ?? null;
  } catch { /* ignora */ }

  try {
    const evento = await persistirWebhookEvent("twilio", messageSid, tenantIdForEvent, body);
    webhookEventId = evento.id;
  } catch { /* ignora falha de persistência */ }

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug, ativo: true } });

    if (!tenant) {
      console.warn(`[Webhook] Tenant não encontrado: ${tenantSlug}`);
      return;
    }

    if (tenant.status === "SUSPENDED" || tenant.status === "CANCELLED") {
      await enviarMensagem(
        { accountSid: tenant.twilio_account_sid, authToken: tenant.twilio_auth_token, numeroOrigem: tenant.telefone_whatsapp },
        remetenteRaw,
        "Olá! Nosso serviço está temporariamente indisponível. Entre em contato diretamente com a barbearia."
      );
      return;
    }

    await incrementMetric(tenant.id, "messagesProcessed");
    const sessaoExistente = await prisma.sessaoBot.findUnique({
      where: { tenant_id_cliente_telefone: { tenant_id: tenant.id, cliente_telefone: clienteTelefone } },
    });
    if (!sessaoExistente || sessaoExistente.etapa_atual === "INICIO") {
      await incrementMetric(tenant.id, "botConversations");
    }

    await marcarMensagemRecebida(tenant.id, clienteTelefone);

    const sessao = await obterSessao(tenant.id, clienteTelefone);
    const etapaAtual = sessao.etapa_atual as Etapa;
    const dadosAtuais = (sessao.dados_coletados ?? {}) as DadosColetados;

    // Registrar mensagem inbound na conversa
    const clienteNome = body.ProfileName ?? undefined;
    const conversa = await getOrCreateConversation(tenant.id, clienteTelefone, clienteNome).catch(() => null);
    if (conversa) {
      await addMessage(conversa.id, "inbound", mensagem, buttonPayload || undefined, etapaAtual).catch(() => {});
    }

    if (etapaAtual === "INICIO" || etapaAtual === "CONCLUIDO") {
      const respostaLembrete = await tratarRespostaLembrete(tenant.id, clienteTelefone, mensagem);
      if (respostaLembrete !== null) {
        await enviarMensagem(
          { accountSid: tenant.twilio_account_sid, authToken: tenant.twilio_auth_token, numeroOrigem: tenant.telefone_whatsapp },
          remetenteRaw,
          respostaLembrete
        );
        if (conversa) {
          await addMessage(conversa.id, "outbound", respostaLembrete, undefined, etapaAtual).catch(() => {});
        }
        return;
      }
    }

    const parsedPayload = isStructuredPayload(mensagem) ? parsePayload(mensagem) : undefined;

    const resultado = await processarMensagem({
      tenantId: tenant.id,
      clienteTelefone,
      etapa: etapaAtual,
      dados: dadosAtuais,
      mensagemEntrada: mensagem,
      payloadType: parsedPayload?.type,
      payloadValue: parsedPayload?.value,
    });

    if (resultado.concluido) {
      await resetarSessao(tenant.id, clienteTelefone);
      if (conversa) {
        await completeConversation(tenant.id, clienteTelefone).catch(() => {});
      }
    } else {
      await atualizarSessao(tenant.id, clienteTelefone, resultado.proximaEtapa, resultado.dadosAtualizados);
      if (conversa && resultado.proximaEtapa) {
        await updateConversationStep(tenant.id, clienteTelefone, resultado.proximaEtapa).catch(() => {});
      }
    }

    // Enviar resposta e registrar como outbound
    let respostaEnviada = resultado.resposta;
    if (resultado.opcoes && resultado.opcoes.length > 0) {
      await sendInteractiveMessage({
        tenantId: tenant.id,
        to: remetenteRaw,
        bodyText: resultado.resposta,
        options: resultado.opcoes,
        inSession: true,
      });
    } else {
      await enviarMensagem(
        { accountSid: tenant.twilio_account_sid, authToken: tenant.twilio_auth_token, numeroOrigem: tenant.telefone_whatsapp },
        remetenteRaw,
        resultado.resposta
      );
    }

    if (conversa) {
      await addMessage(conversa.id, "outbound", respostaEnviada, undefined, resultado.proximaEtapa ?? "CONCLUIDO").catch(() => {});
    }

    if (webhookEventId) await marcarWebhookProcessado(webhookEventId);

  } catch (err) {
    console.error(`[Webhook] Erro ao processar mensagem de ${clienteTelefone}:`, err);
    if (webhookEventId) {
      await marcarWebhookFalhou(webhookEventId, String(err)).catch(() => {});
    }
    try {
      const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (t) await incrementMetric(t.id, "webhookErrors");
    } catch { /* ignora */ }
  }
});

export default router;
