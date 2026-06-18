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

const router = Router();

router.post("/:tenantSlug", async (req: Request, res: Response): Promise<void> => {
  // Twilio espera HTTP 200 imediatamente; erros são logados mas não retornam 5xx
  res.sendStatus(200);

  const { tenantSlug } = req.params;
  const body = req.body as Record<string, string>;
  const remetenteRaw = body.From ?? "";
  const clienteTelefone = extrairNumero(remetenteRaw);

  // ButtonPayload vem preenchido quando o cliente clica num botão/lista interativa.
  // Nesse caso tem prioridade sobre Body (que carrega o label visível do botão).
  const buttonPayload = (body.ButtonPayload ?? "").trim();
  const bodyTexto = (body.Body ?? "").trim();
  const mensagem = buttonPayload || bodyTexto;

  if (!mensagem || !clienteTelefone) return;

  // Log para debug: indica origem da mensagem
  if (buttonPayload) {
    const parsed = parsePayload(buttonPayload);
    console.log(`[Webhook] botão clicado: type=${parsed.type} value=${parsed.value} de ${clienteTelefone}`);
  }

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug, ativo: true } });

    if (!tenant) {
      console.warn(`[Webhook] Tenant não encontrado: ${tenantSlug}`);
      return;
    }

    // Registra timestamp da mensagem recebida (para detecção de janela de 24h)
    await marcarMensagemRecebida(tenant.id, clienteTelefone);

    const sessao = await obterSessao(tenant.id, clienteTelefone);
    const etapaAtual = sessao.etapa_atual as Etapa;
    const dadosAtuais = (sessao.dados_coletados ?? {}) as DadosColetados;

    // Intercept CONFIRMAR/CANCELAR replies from reminder messages (only when idle)
    if (etapaAtual === "INICIO" || etapaAtual === "CONCLUIDO") {
      const respostaLembrete = await tratarRespostaLembrete(tenant.id, clienteTelefone, mensagem);
      if (respostaLembrete !== null) {
        await enviarMensagem(
          { accountSid: tenant.twilio_account_sid, authToken: tenant.twilio_auth_token, numeroOrigem: tenant.telefone_whatsapp },
          remetenteRaw,
          respostaLembrete
        );
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
    } else {
      await atualizarSessao(
        tenant.id,
        clienteTelefone,
        resultado.proximaEtapa,
        resultado.dadosAtualizados
      );
    }

    // Webhook é sempre acionado por mensagem do cliente → estamos dentro da janela de 24h
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
        {
          accountSid: tenant.twilio_account_sid,
          authToken: tenant.twilio_auth_token,
          numeroOrigem: tenant.telefone_whatsapp,
        },
        remetenteRaw,
        resultado.resposta
      );
    }
  } catch (err) {
    console.error(`[Webhook] Erro ao processar mensagem de ${clienteTelefone}:`, err);
  }
});

export default router;
