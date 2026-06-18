import { prisma } from "../lib/prisma";
import { enviarMensagem } from "./twilioService";
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
    include: { tenant: true, profissional: true, servico: true },
  });

  for (const ag of agendamentos) {
    const template = ag.tenant.mensagem_lembrete ?? MSG_LEMBRETE_PADRAO;
    const mensagem = renderizarMensagemLembrete(template, {
      clientName: ag.cliente_nome,
      date: ag.data_hora.toLocaleDateString("pt-BR"),
      time: ag.data_hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      serviceName: ag.servico.nome,
      barberName: ag.profissional.nome,
    });

    let status: "entregue" | "falhou" = "entregue";
    try {
      await enviarMensagem(
        {
          accountSid: ag.tenant.twilio_account_sid,
          authToken: ag.tenant.twilio_auth_token,
          numeroOrigem: ag.tenant.telefone_whatsapp,
        },
        `whatsapp:${ag.cliente_telefone}`,
        mensagem
      );
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
  const resposta = mensagem.trim().toUpperCase();
  if (resposta !== "CONFIRMAR" && resposta !== "CANCELAR") return null;

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

  if (resposta === "CONFIRMAR") {
    return MSG_LEMBRETE_CONFIRMADO;
  }

  await cancelarAgendamento(agendamento.id);
  return MSG_LEMBRETE_CANCELADO;
}
