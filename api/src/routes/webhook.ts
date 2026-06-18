import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { obterSessao, atualizarSessao, resetarSessao } from "../services/sessaoService";
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
  const mensagem = (body.Body ?? "").trim();
  const remetenteRaw = body.From ?? "";
  const clienteTelefone = extrairNumero(remetenteRaw);

  if (!mensagem || !clienteTelefone) return;

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug, ativo: true } });

    if (!tenant) {
      console.warn(`[Webhook] Tenant não encontrado: ${tenantSlug}`);
      return;
    }

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

    const resultado = await processarMensagem({
      tenantId: tenant.id,
      clienteTelefone,
      etapa: etapaAtual,
      dados: dadosAtuais,
      mensagemEntrada: mensagem,
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

    await enviarMensagem(
      {
        accountSid: tenant.twilio_account_sid,
        authToken: tenant.twilio_auth_token,
        numeroOrigem: tenant.telefone_whatsapp,
      },
      remetenteRaw,
      resultado.resposta
    );
  } catch (err) {
    console.error(`[Webhook] Erro ao processar mensagem de ${clienteTelefone}:`, err);
  }
});

export default router;
