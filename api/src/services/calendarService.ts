import { google } from "googleapis";
import { prisma } from "../lib/prisma";
import { obterClienteAutenticado } from "../lib/googleAuth";

const HORARIO_INICIO = 8;
const HORARIO_FIM = 18;
const INTERVALO_MINUTOS = 30;

function gerarSlotsBase(dataISO: string): Date[] {
  const slots: Date[] = [];
  for (let h = HORARIO_INICIO; h < HORARIO_FIM; h++) {
    for (let m = 0; m < 60; m += INTERVALO_MINUTOS) {
      const d = new Date(`${dataISO}T00:00:00`);
      d.setHours(h, m, 0, 0);
      slots.push(d);
    }
  }
  return slots;
}

function formatarHorario(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function buscarOcupadosGoogleCalendar(
  tenantId: string,
  calendarId: string,
  dataISO: string
): Promise<Array<{ inicio: Date; fim: Date }>> {
  try {
    const auth = await obterClienteAutenticado(tenantId);
    const calendar = google.calendar({ version: "v3", auth });

    const timeMin = new Date(`${dataISO}T00:00:00`).toISOString();
    const timeMax = new Date(`${dataISO}T23:59:59`).toISOString();

    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: calendarId }],
      },
    });

    const busy = res.data.calendars?.[calendarId]?.busy ?? [];
    return busy
      .filter((b) => b.start && b.end)
      .map((b) => ({ inicio: new Date(b.start!), fim: new Date(b.end!) }));
  } catch (err) {
    console.error("[Calendar] Erro ao consultar freebusy — usando apenas BD:", err);
    return [];
  }
}

async function buscarOcupadosBanco(
  tenantId: string,
  profissionalId: string,
  dataISO: string
): Promise<Array<{ inicio: Date; fim: Date }>> {
  const inicioDia = new Date(`${dataISO}T00:00:00`);
  const fimDia = new Date(`${dataISO}T23:59:59`);

  const agendamentos = await prisma.agendamento.findMany({
    where: {
      tenant_id: tenantId,
      profissional_id: profissionalId,
      data_hora: { gte: inicioDia, lte: fimDia },
      status: { not: "cancelado" },
    },
    include: {
      servico: { select: { duracao_minutos: true } },
      itens_servico: { include: { servico: { select: { duracao_minutos: true } } } },
    },
  });

  return agendamentos.map((a) => {
    // duração = soma dos itens; fallback para o serviço primário (agendamentos antigos)
    const duracao =
      a.itens_servico && a.itens_servico.length > 0
        ? a.itens_servico.reduce((sum, it) => sum + it.servico.duracao_minutos, 0)
        : a.servico.duracao_minutos;
    return {
      inicio: a.data_hora,
      fim: new Date(a.data_hora.getTime() + duracao * 60_000),
    };
  });
}

async function buscarBloqueios(
  tenantId: string,
  profissionalId: string,
  dataISO: string
): Promise<Array<{ inicio: Date; fim: Date }>> {
  const inicioDia = new Date(`${dataISO}T00:00:00`);
  const fimDia = new Date(`${dataISO}T23:59:59`);

  const bloqueios = await prisma.bloqueio.findMany({
    where: {
      tenant_id: tenantId,
      profissional_id: profissionalId,
      inicio: { lte: fimDia },
      fim: { gte: inicioDia },
    },
  });

  return bloqueios.map((b) => ({ inicio: b.inicio, fim: b.fim }));
}

function slotEstaLivre(
  slot: Date,
  ocupados: Array<{ inicio: Date; fim: Date }>,
  duracaoMinutos = INTERVALO_MINUTOS
): boolean {
  const slotFim = new Date(slot.getTime() + duracaoMinutos * 60_000);
  return ocupados.every((o) => slotFim <= o.inicio || slot >= o.fim);
}

export async function buscarHorariosDisponiveis(
  tenantId: string,
  profissionalId: string,
  dataISO: string
): Promise<string[]> {
  const profissional = await prisma.profissional.findUniqueOrThrow({
    where: { id: profissionalId },
  });

  const [ocupadosBanco, ocupadosGcal, bloqueios] = await Promise.all([
    buscarOcupadosBanco(tenantId, profissionalId, dataISO),
    profissional.google_calendar_id
      ? buscarOcupadosGoogleCalendar(tenantId, profissional.google_calendar_id, dataISO)
      : Promise.resolve([]),
    buscarBloqueios(tenantId, profissionalId, dataISO),
  ]);

  const todosOcupados = [...ocupadosBanco, ...ocupadosGcal, ...bloqueios];
  const agora = new Date();
  const slots = gerarSlotsBase(dataISO);

  return slots
    .filter((slot) => slot > agora && slotEstaLivre(slot, todosOcupados))
    .map(formatarHorario);
}

export async function criarEventoCalendar(
  tenantId: string,
  calendarId: string | null,
  titulo: string,
  dataHora: Date,
  duracaoMinutos: number,
  descricao?: string
): Promise<string | null> {
  if (!calendarId) return null;

  try {
    const auth = await obterClienteAutenticado(tenantId);
    const calendar = google.calendar({ version: "v3", auth });

    const fim = new Date(dataHora.getTime() + duracaoMinutos * 60_000);

    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: titulo,
        description: descricao,
        start: { dateTime: dataHora.toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: fim.toISOString(), timeZone: "America/Sao_Paulo" },
      },
    });

    return event.data.id ?? null;
  } catch (err) {
    console.error("[Calendar] Erro ao criar evento:", err);
    return null;
  }
}

export async function atualizarEventoCalendar(
  tenantId: string,
  calendarId: string | null,
  eventId: string | null,
  dataHora: Date,
  duracaoMinutos: number
): Promise<void> {
  if (!calendarId || !eventId) return;

  try {
    const auth = await obterClienteAutenticado(tenantId);
    const calendar = google.calendar({ version: "v3", auth });
    const fim = new Date(dataHora.getTime() + duracaoMinutos * 60_000);

    await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        start: { dateTime: dataHora.toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: fim.toISOString(), timeZone: "America/Sao_Paulo" },
      },
    });
  } catch (err) {
    console.error("[Calendar] Erro ao atualizar evento:", err);
  }
}

export async function cancelarEventoCalendar(
  tenantId: string,
  calendarId: string | null,
  eventId: string | null
): Promise<void> {
  if (!calendarId || !eventId) return;

  try {
    const auth = await obterClienteAutenticado(tenantId);
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.delete({ calendarId, eventId });
  } catch (err) {
    console.error("[Calendar] Erro ao cancelar evento:", err);
  }
}
