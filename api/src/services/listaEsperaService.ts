import { prisma } from "../lib/prisma";
import { buscarHorariosDisponiveis } from "./calendarService";
import { enviarMensagem } from "./twilioService";
import { sendInteractiveMessage } from "../whatsapp/interactiveMessenger";
import { isWithinSession } from "../whatsapp/sessionWindow";
import { MSG_FILA_ESPERA_VAGA_DISPONIVEL } from "../constants/messages";

const DIAS_PARA_EXPIRAR = 1;

function calcularExpiraEm(dataDesejada: Date): Date {
  const expira = new Date(dataDesejada);
  expira.setDate(expira.getDate() + DIAS_PARA_EXPIRAR);
  return expira;
}

export async function adicionarNaFila(params: {
  tenantId: string;
  clienteNome: string;
  clienteTelefone: string;
  profissionalId: string | null;
  servicoId: string;
  dataDesejada: Date;
}) {
  return prisma.listaEspera.create({
    data: {
      tenant_id: params.tenantId,
      cliente_nome: params.clienteNome,
      cliente_telefone: params.clienteTelefone,
      profissional_id: params.profissionalId,
      servico_id: params.servicoId,
      data_desejada: params.dataDesejada,
      expira_em: calcularExpiraEm(params.dataDesejada),
    },
  });
}

export async function marcarConvertidosPorAgendamento(
  tenantId: string,
  clienteTelefone: string,
  profissionalId: string,
  dataHora: Date
): Promise<void> {
  const inicioDia = new Date(dataHora.toDateString());
  const fimDia = new Date(inicioDia.getTime() + 86_400_000);

  await prisma.listaEspera.updateMany({
    where: {
      tenant_id: tenantId,
      cliente_telefone: clienteTelefone,
      status: { in: ["aguardando", "notificado"] },
      data_desejada: { gte: inicioDia, lt: fimDia },
      OR: [{ profissional_id: profissionalId }, { profissional_id: null }],
    },
    data: { status: "convertido" },
  });
}

export async function processarFilaEspera(): Promise<void> {
  const agora = new Date();

  await prisma.listaEspera.updateMany({
    where: { status: { in: ["aguardando", "notificado"] }, expira_em: { lt: agora } },
    data: { status: "expirado" },
  });

  const pendentes = await prisma.listaEspera.findMany({
    where: { status: "aguardando", expira_em: { gte: agora } },
    include: { tenant: true, servico: true, profissional: true },
  });

  for (const entrada of pendentes) {
    const dataISO = entrada.data_desejada.toISOString().slice(0, 10);

    const profissionaisParaChecar = entrada.profissional
      ? [entrada.profissional]
      : await prisma.profissional.findMany({
          where: { tenant_id: entrada.tenant_id, ativo: true },
        });

    let profissionalDisponivel: { nome: string } | null = null;

    for (const prof of profissionaisParaChecar) {
      const horarios = await buscarHorariosDisponiveis(entrada.tenant_id, prof.id, dataISO);
      if (horarios.length > 0) {
        profissionalDisponivel = prof;
        break;
      }
    }

    if (!profissionalDisponivel) continue;

    try {
      const corpo = MSG_FILA_ESPERA_VAGA_DISPONIVEL(
        entrada.cliente_nome,
        entrada.data_desejada.toLocaleDateString("pt-BR"),
        profissionalDisponivel.nome,
        entrada.servico.nome
      );
      const destinatario = `whatsapp:${entrada.cliente_telefone}`;
      const emSessao = await isWithinSession(entrada.tenant_id, entrada.cliente_telefone);

      if (!emSessao) {
        const tmpl = await prisma.whatsAppTemplate.findUnique({
          where: { tenant_id_chave: { tenant_id: entrada.tenant_id, chave: "vaga_fila_espera" } },
        });

        if (tmpl?.status === "aprovado") {
          await sendInteractiveMessage({
            tenantId: entrada.tenant_id,
            to: destinatario,
            bodyText: corpo,
            options: [],
            inSession: false,
            contentSid: tmpl.content_sid,
            contentVariables: {
              "1": entrada.cliente_nome,
              "2": entrada.data_desejada.toLocaleDateString("pt-BR"),
              "3": profissionalDisponivel.nome,
              "4": entrada.servico.nome,
            },
          });
        } else {
          console.warn(`[ListaEspera] Sem template aprovado para tenant ${entrada.tenant_id} — enviando texto simples fora de sessão`);
          await enviarMensagem(
            { accountSid: entrada.tenant.twilio_account_sid, authToken: entrada.tenant.twilio_auth_token, numeroOrigem: entrada.tenant.telefone_whatsapp },
            destinatario,
            corpo
          );
        }
      } else {
        await enviarMensagem(
          { accountSid: entrada.tenant.twilio_account_sid, authToken: entrada.tenant.twilio_auth_token, numeroOrigem: entrada.tenant.telefone_whatsapp },
          destinatario,
          corpo
        );
      }

      await prisma.listaEspera.update({
        where: { id: entrada.id },
        data: { status: "notificado", notificado_em: new Date() },
      });
    } catch (err) {
      console.error("[ListaEspera] Erro ao notificar cliente da fila:", err);
    }
  }
}
