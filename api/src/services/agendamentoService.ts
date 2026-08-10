import { prisma } from "../lib/prisma";
import type { DadosColetados } from "../lib/types";
import { criarEventoCalendar, cancelarEventoCalendar } from "./calendarService";
import { enviarMensagem } from "./twilioService";
import { marcarConvertidosPorAgendamento } from "./listaEsperaService";
import { upsertCliente } from "./clienteService";
import { incrementMetric } from "../platform/services/usageMetrics";

export async function criarAgendamento(
  tenantId: string,
  clienteTelefone: string,
  dados: DadosColetados
): Promise<void> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const profissional = await prisma.profissional.findUniqueOrThrow({
    where: { id: dados.profissional_id! },
  });
  const servico = await prisma.servico.findUniqueOrThrow({
    where: { id: dados.servico_id! },
  });

  const [hora, minuto] = dados.horario!.split(":").map(Number);
  const dataHora = new Date(`${dados.data!}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00`);

  const calendarId = profissional.google_calendar_id ?? tenant.google_calendar_id_dono;
  const googleEventId = await criarEventoCalendar(
    tenantId,
    calendarId,
    `${servico.nome} — ${dados.cliente_nome}`,
    dataHora,
    servico.duracao_minutos,
    `Cliente: ${dados.cliente_nome} | Tel: ${clienteTelefone}`
  );

  await prisma.agendamento.create({
    data: {
      tenant_id: tenantId,
      profissional_id: dados.profissional_id!,
      servico_id: dados.servico_id!,
      cliente_nome: dados.cliente_nome!,
      cliente_telefone: clienteTelefone,
      data_hora: dataHora,
      status: "confirmado",
      preco: servico.preco,
      google_event_id: googleEventId,
    },
  });

  await upsertCliente(tenantId, dados.cliente_nome!, clienteTelefone, "whatsapp").catch((e) =>
    console.error("[CRM] Falha ao upsert cliente:", e)
  );

  incrementMetric(tenantId, "appointmentsCreated").catch(() => {});

  await enviarNotificacoes(tenant, profissional, servico, dados, clienteTelefone, dataHora);

  await marcarConvertidosPorAgendamento(tenantId, clienteTelefone, dados.profissional_id!, dataHora).catch((e) =>
    console.error("[ListaEspera] Falha ao marcar conversão:", e)
  );
}

export async function cancelarAgendamento(agendamentoId: string): Promise<void> {
  const ag = await prisma.agendamento.findUniqueOrThrow({
    where: { id: agendamentoId },
    include: { profissional: true, tenant: true },
  });

  const calendarId = ag.profissional.google_calendar_id ?? ag.tenant.google_calendar_id_dono;
  await cancelarEventoCalendar(ag.tenant_id, calendarId, ag.google_event_id);

  await prisma.agendamento.update({
    where: { id: agendamentoId },
    data: { status: "cancelado" },
  });
}

async function enviarNotificacoes(
  tenant: { twilio_account_sid: string; twilio_auth_token: string; telefone_whatsapp: string; nome: string },
  profissional: { nome: string; telefone_whatsapp: string | null },
  servico: { nome: string },
  dados: DadosColetados,
  clienteTelefone: string,
  dataHora: Date
): Promise<void> {
  const creds = {
    accountSid: tenant.twilio_account_sid,
    authToken: tenant.twilio_auth_token,
    numeroOrigem: tenant.telefone_whatsapp,
  };

  const dataFormatada = dataHora.toLocaleDateString("pt-BR");
  const horaFormatada = dataHora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const msgCliente =
    `✅ *Agendamento confirmado — ${tenant.nome}*\n\n` +
    `📋 ${servico.nome}\n` +
    `👤 ${profissional.nome}\n` +
    `📅 ${dataFormatada} às ${horaFormatada}`;

  const msgProfissional =
    `📅 *Novo agendamento!*\n\n` +
    `Cliente: ${dados.cliente_nome}\n` +
    `Serviço: ${servico.nome}\n` +
    `Horário: ${dataFormatada} às ${horaFormatada}`;

  const msgDono =
    `📣 *Novo agendamento em ${tenant.nome}*\n\n` +
    `Cliente: ${dados.cliente_nome} (${clienteTelefone})\n` +
    `Serviço: ${servico.nome}\n` +
    `Profissional: ${profissional.nome}\n` +
    `Horário: ${dataFormatada} às ${horaFormatada}`;

  const promises: Promise<void>[] = [
    enviarMensagem(creds, `whatsapp:${clienteTelefone}`, msgCliente).catch((e) =>
      console.error("[Notif] Falha ao notificar cliente:", e)
    ),
  ];

  if (profissional.telefone_whatsapp) {
    promises.push(
      enviarMensagem(creds, profissional.telefone_whatsapp, msgProfissional).catch((e) =>
        console.error("[Notif] Falha ao notificar profissional:", e)
      )
    );
  }

  promises.push(
    enviarMensagem(creds, tenant.telefone_whatsapp, msgDono).catch((e) =>
      console.error("[Notif] Falha ao notificar dono:", e)
    )
  );

  await Promise.all(promises);
}
