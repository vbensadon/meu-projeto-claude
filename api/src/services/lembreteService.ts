import { prisma } from "../lib/prisma";
import { enviarMensagem } from "./twilioService";
import { sendInteractiveMessage } from "../whatsapp/interactiveMessenger";
import { isWithinSession } from "../whatsapp/sessionWindow";
import { cancelarAgendamento } from "./agendamentoService";
import { MSG_LEMBRETE_PADRAO, MSG_LEMBRETE_CONFIRMADO, MSG_LEMBRETE_CANCELADO } from "../constants/messages";

const JANELA_INICIO_HORAS = 23;
const JANELA_FIM_HORAS = 25;

function renderizarMensagemLembrete(
  template: string,
  vars: { clientName: string; date: string; time: string; serviceName: string; barberName: string }
): string {
  return template
    .replace(/{clientName}/g, vars.clientName)
    .replace(/{date}/g, vars.date)
    .replace(/{time}/g, vars.time)
    .replace(/{serviceName}/g, vars.serviceName)
    .replace(/{barberName}/g, vars.barberName);
}

export async function processarLembretes(): Promise<void> {
  const agora = new Date();
  const janelaInicio = new Date(agora.getTime() + JANELA_INICIO_HORAS * 3_600_000);
  const janelaFim = new Date(agora.getTime() + JANELA_FIM_HORAS * 3_600_000);

  const agendamentos = await prisma.agendamento.findMany({
    where: {
      status: { in: ["pendente", "confirmado"] },
      data_hora: { gte: janelaInicio, lte: janelaFim },
      lembrete_enviado_em: null,
      tenant: { lembretes_ativos: true },
    },
    include: {
      tenant: true,
      profissional: true,
      servico: true,
      itens_servico: { include: { servico: { select: { nome: true } } }, orderBy: { ordem: "asc" } },
    },
  });

  for (const ag of agendamentos) {
    const nomesServicos = ag.itens_servico.length > 0
      ? ag.itens_servico.map((i) => i.servico.nome).join(", ")
      : ag.servico.nome;
    const template = ag.tenant.mensagem_lembrete ?? MSG_LEMBRETE_PADRAO;
    const mensagem = renderizarMensagemLembrete(template, {
      clientName: ag.cliente_nome,
      date: ag.data_hora.toLocaleDateString("pt-BR"),
      time: ag.data_hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      serviceName: nomesServicos,
      barberName: ag.profissional.nome,
    });

    let status: "entregue" | "falhou" = "entregue";
    try {
      const emSessao = await isWithinSession(ag.tenant_id, ag.cliente_telefone);
      const destinatario = `whatsapp:${ag.cliente_telefone}`;

      if (!emSessao) {
        // Fora da janela de 24h: tenta usar template aprovado
        const tmpl = await prisma.whatsAppTemplate.findUnique({
          where: { tenant_id_chave: { tenant_id: ag.tenant_id, chave: "lembrete_24h" } },
        });

        if (tmpl?.status === "aprovado") {
          await sendInteractiveMessage({
            tenantId: ag.tenant_id,
            to: destinatario,
            bodyText: mensagem,
            options: [
              { label: "Confirmar", payload: "lembrete:confirmar" },
              { label: "Cancelar", payload: "lembrete:cancelar" },
            ],
            inSession: false,
            contentSid: tmpl.content_sid,
            contentVariables: {
              "1": ag.cliente_nome,
              "2": ag.data_hora.toLocaleDateString("pt-BR"),
              "3": ag.data_hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
              "4": nomesServicos,
              "5": ag.profissional.nome,
            },
          });
        } else {
          // Sem template aprovado: tenta texto simples e avisa no log
          console.warn(`[Lembrete] Sem template aprovado para tenant ${ag.tenant_id} — enviando texto simples fora de sessão`);
          await enviarMensagem(
            { accountSid: ag.tenant.twilio_account_sid, authToken: ag.tenant.twilio_auth_token, numeroOrigem: ag.tenant.telefone_whatsapp },
            destinatario,
            mensagem
          );
        }
      } else {
        // Dentro da sessão: quick reply com Confirmar/Cancelar
        await sendInteractiveMessage({
          tenantId: ag.tenant_id,
          to: destinatario,
          bodyText: mensagem,
          options: [
            { label: "Confirmar", payload: "lembrete:confirmar" },
            { label: "Cancelar", payload: "lembrete:cancelar" },
          ],
          inSession: true,
        });
      }
    } catch (err) {
      console.error("[Lembrete] Erro ao enviar lembrete:", err);
      status = "falhou";
    }

    await prisma.agendamento.update({
      where: { id: ag.id },
      data: { lembrete_enviado_em: new Date(), lembrete_status: status },
    });
  }
}

export async function tratarRespostaLembrete(
  tenantId: string,
  clienteTelefone: string,
  mensagem: string
): Promise<string | null> {
  const raw = mensagem.trim();
  // Aceita tanto texto digitado quanto payload de botão interativo
  const normalizado = raw.toUpperCase();
  const isConfirmar = normalizado === "CONFIRMAR" || raw === "lembrete:confirmar";
  const isCancelar = normalizado === "CANCELAR" || raw === "lembrete:cancelar";
  if (!isConfirmar && !isCancelar) return null;
  const resposta = isConfirmar ? "CONFIRMAR" : "CANCELAR";

  const agendamento = await prisma.agendamento.findFirst({
    where: {
      tenant_id: tenantId,
      cliente_telefone: clienteTelefone,
      status: { in: ["pendente", "confirmado"] },
      lembrete_enviado_em: { not: null },
      data_hora: { gte: new Date() },
    },
    orderBy: { data_hora: "asc" },
  });

  if (!agendamento) return null;

  if (resposta === "CONFIRMAR") return MSG_LEMBRETE_CONFIRMADO;

  await cancelarAgendamento(agendamento.id);
  return MSG_LEMBRETE_CANCELADO;
}
