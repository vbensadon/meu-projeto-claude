/**
 * Teste de integração — conversa completa via webhook
 *
 * Simula o fluxo real: cliente manda mensagens sequenciais, o sistema
 * processa cada uma e envia respostas. Verifica que ao final um
 * agendamento é criado e as notificações são disparadas.
 */

import request from "supertest";
import app from "../index";
import { prisma } from "../lib/prisma";

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock("../lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    sessaoBot: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    servico: { findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    profissional: { findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    agendamento: { findMany: jest.fn(), create: jest.fn() },
    interactiveMessageConfig: { findUnique: jest.fn() },
  },
}));

// Serviços de plataforma (instrumentação do webhook) — no-op nos testes de fluxo
jest.mock("../platform/services/usageMetrics", () => ({
  incrementMetric: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../platform/services/conversationService", () => ({
  getOrCreateConversation: jest.fn().mockResolvedValue(null),
  addMessage: jest.fn().mockResolvedValue(undefined),
  updateConversationStep: jest.fn().mockResolvedValue(undefined),
  completeConversation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/twilioService", () => ({
  enviarMensagem: jest.fn().mockResolvedValue(undefined),
  extrairNumero: (raw: string) => raw.replace(/^whatsapp:/, ""),
}));

// Mensagens com opções vão pelo interactiveMessenger (cliente Twilio direto).
// Nos testes, delegamos ao enviarMensagem mockado para inspecionar o corpo.
jest.mock("../whatsapp/interactiveMessenger", () => ({
  sendInteractiveMessage: jest.fn(async (params: { to: string; bodyText: string; options?: { label: string; description?: string }[] }) => {
    const { enviarMensagem } = jest.requireMock("../services/twilioService");
    const lista = (params.options ?? []).map((o, i) => `${i + 1}. ${o.label}${o.description ? ` — ${o.description}` : ""}`).join("\n");
    await enviarMensagem({ accountSid: "ACtest", authToken: "authtoken", numeroOrigem: "whatsapp:+14155238886" }, params.to, `${params.bodyText}\n\n${lista}`);
  }),
}));

jest.mock("../services/calendarService", () => ({
  buscarHorariosDisponiveis: jest.fn().mockResolvedValue(["09:00", "09:30", "10:00"]),
  criarEventoCalendar: jest.fn().mockResolvedValue("gcal-event-001"),
}));

jest.mock("../services/listaEsperaService", () => ({
  adicionarNaFila: jest.fn().mockResolvedValue({}),
  marcarConvertidosPorAgendamento: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/lembreteService", () => ({
  tratarRespostaLembrete: jest.fn().mockResolvedValue(null),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const TENANT = {
  id: "tenant-abc", slug: "barbearia-teste", ativo: true,
  twilio_account_sid: "ACtest", twilio_auth_token: "authtoken",
  telefone_whatsapp: "whatsapp:+14155238886",
  google_calendar_id_dono: "primary", nome: "Barbearia Teste",
};

const SERVICOS = [
  { id: "s1", nome: "Corte de Cabelo", duracao_minutos: 30, preco: "35.00" },
  { id: "s2", nome: "Barba", duracao_minutos: 20, preco: "25.00" },
];

const PROFISSIONAIS = [
  { id: "p1", nome: "Carlos Silva", ativo: true, google_calendar_id: null, telefone_whatsapp: "whatsapp:+5511888888888" },
];

const AMANHA = new Date();
AMANHA.setDate(AMANHA.getDate() + 1);
const DATA_ISO = AMANHA.toISOString().slice(0, 10);
const [ANO, MES, DIA] = DATA_ISO.split("-");
const DATA_BR = `${DIA}/${MES}/${ANO}`;

const CLIENTE = "whatsapp:+5511999999999";
const TENANT_DADOS_FULL = {
  ...TENANT,
  google_refresh_token: "refresh-token",
  google_access_token: "access-token",
  google_token_expiry: new Date(Date.now() + 3600000),
};

// ── Estado da sessão simulado em memória ───────────────────────────────────

let sessaoAtual = { etapa_atual: "INICIO", dados_coletados: {} as Record<string, unknown> };

function setupMockSessao() {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  (mockPrisma.sessaoBot.upsert as jest.Mock).mockImplementation(() =>
    Promise.resolve({ ...sessaoAtual })
  );
  (mockPrisma.sessaoBot.update as jest.Mock).mockImplementation(({ data }) => {
    if (data.etapa_atual !== undefined) sessaoAtual.etapa_atual = data.etapa_atual;
    if (data.dados_coletados !== undefined) sessaoAtual.dados_coletados = data.dados_coletados;
    if (data.etapa_atual === "INICIO" && typeof data.dados_coletados === "object") {
      sessaoAtual = { etapa_atual: "INICIO", dados_coletados: {} };
    }
    return Promise.resolve(sessaoAtual);
  });
}

// ── Helper ─────────────────────────────────────────────────────────────────

async function enviarMensagem(body: string) {
  const res = await request(app)
    .post("/webhook/barbearia-teste")
    .type("form")
    .send({ Body: body, From: CLIENTE });

  // Aguarda o processamento assíncrono (webhook retorna 200 imediatamente)
  await new Promise((r) => setTimeout(r, 80));
  return res;
}

function ultimaResposta(): string {
  const { enviarMensagem: mock } = jest.requireMock("../services/twilioService");
  const calls = (mock as jest.Mock).mock.calls;
  return calls[calls.length - 1]?.[2] ?? "";
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  sessaoAtual = { etapa_atual: "INICIO", dados_coletados: {} };
  setupMockSessao();

  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(TENANT);
  (mockPrisma.tenant.findUniqueOrThrow as jest.Mock).mockResolvedValue(TENANT);
  (mockPrisma.servico.findMany as jest.Mock).mockResolvedValue(SERVICOS);
  (mockPrisma.servico.findUniqueOrThrow as jest.Mock).mockResolvedValue(SERVICOS[0]);
  (mockPrisma.profissional.findMany as jest.Mock).mockResolvedValue(PROFISSIONAIS);
  (mockPrisma.profissional.findUniqueOrThrow as jest.Mock).mockResolvedValue({
    ...PROFISSIONAIS[0],
    tenant: TENANT_DADOS_FULL,
  });
  (mockPrisma.agendamento.create as jest.Mock).mockResolvedValue({ id: "ag-001" });
  (mockPrisma.agendamento.findMany as jest.Mock).mockResolvedValue([]);
  (mockPrisma.interactiveMessageConfig.findUnique as jest.Mock).mockResolvedValue(null);
});

// ── Testes ─────────────────────────────────────────────────────────────────

describe("Conversa completa — fluxo feliz", () => {
  it("1. cliente diz 'oi' → recebe lista de serviços", async () => {
    await enviarMensagem("oi");
    const resposta = ultimaResposta();
    expect(sessaoAtual.etapa_atual).toBe("SERVICO");
    expect(resposta).toContain("Corte de Cabelo");
    expect(resposta).toContain("Barba");
    expect(resposta).toContain("R$");
  });

  it("2. escolhe serviço → pergunta se quer adicionar outro", async () => {
    sessaoAtual = { etapa_atual: "SERVICO", dados_coletados: {} };
    await enviarMensagem("1");
    const resposta = ultimaResposta();
    expect(sessaoAtual.etapa_atual).toBe("SERVICO_MAIS");
    expect(resposta).toMatch(/adicionar outro|continuar/i);
  });

  it("2b. continuar → recebe lista de profissionais", async () => {
    sessaoAtual = {
      etapa_atual: "SERVICO_MAIS",
      dados_coletados: { servico_id: "s1", servico_nome: "Corte de Cabelo", servicos_ids: ["s1"], servicos_nomes: ["Corte de Cabelo"] },
    };
    await enviarMensagem("2"); // Continuar
    const resposta = ultimaResposta();
    expect(sessaoAtual.etapa_atual).toBe("PROFISSIONAL");
    expect(resposta).toContain("Carlos Silva");
  });

  it("3. escolhe profissional → pede data", async () => {
    sessaoAtual = { etapa_atual: "PROFISSIONAL", dados_coletados: { servico_id: "s1", servico_nome: "Corte de Cabelo" } };
    await enviarMensagem("1");
    expect(sessaoAtual.etapa_atual).toBe("DATA");
    const resposta = ultimaResposta();
    expect(resposta).toContain("data");
  });

  it("4. informa data → recebe horários disponíveis", async () => {
    sessaoAtual = {
      etapa_atual: "DATA",
      dados_coletados: { servico_id: "s1", profissional_id: "p1" },
    };
    await enviarMensagem(DATA_BR);
    expect(sessaoAtual.etapa_atual).toBe("HORARIO");
    const resposta = ultimaResposta();
    expect(resposta).toContain("09:00");
    expect(resposta).toContain("09:30");
  });

  it("5. escolhe horário → mostra resumo para confirmar", async () => {
    sessaoAtual = {
      etapa_atual: "HORARIO",
      dados_coletados: { servico_id: "s1", profissional_id: "p1", data: DATA_ISO, servico_nome: "Corte", profissional_nome: "Carlos" },
    };
    await enviarMensagem("2");
    expect(sessaoAtual.etapa_atual).toBe("CONFIRMACAO");
    const resposta = ultimaResposta();
    expect(resposta).toContain("09:30");
    expect(resposta).toMatch(/confirm/i);
  });

  it("6. informa nome → agendamento criado e sessão resetada", async () => {
    const mockPrisma = prisma as jest.Mocked<typeof prisma>;
    sessaoAtual = {
      etapa_atual: "CONFIRMAR",
      dados_coletados: {
        servico_id: "s1", servico_nome: "Corte de Cabelo",
        profissional_id: "p1", profissional_nome: "Carlos Silva",
        data: DATA_ISO, horario: "09:00",
      },
    };
    await enviarMensagem("Maria da Silva");

    expect(mockPrisma.agendamento.create).toHaveBeenCalledTimes(1);

    const args = (mockPrisma.agendamento.create as jest.Mock).mock.calls[0][0].data;
    expect(args.cliente_nome).toBe("Maria da Silva");
    expect(args.cliente_telefone).toBe("+5511999999999");
    expect(args.status).toBe("confirmado");

    const resposta = ultimaResposta();
    expect(resposta).toContain("confirmado");
    expect(resposta).toContain("Maria da Silva");
  });
});

describe("Conversa completa — notificações", () => {
  it("envia 3 mensagens WhatsApp após confirmar (cliente + profissional + dono)", async () => {
    const { enviarMensagem: mockEnviar } = jest.requireMock("../services/twilioService");
    sessaoAtual = {
      etapa_atual: "CONFIRMAR",
      dados_coletados: {
        servico_id: "s1", servico_nome: "Corte",
        profissional_id: "p1", profissional_nome: "Carlos",
        data: DATA_ISO, horario: "10:00",
      },
    };

    await enviarMensagem("João Pedro");

    // 1 msg de resposta do bot + 3 notificações
    const todasChamadas: string[][] = (mockEnviar as jest.Mock).mock.calls;
    const destinatarios = todasChamadas.map((c) => c[1]);

    expect(destinatarios).toContain(`whatsapp:+5511999999999`); // cliente
    expect(destinatarios).toContain("whatsapp:+5511888888888"); // profissional
    expect(destinatarios).toContain(TENANT.telefone_whatsapp);  // dono
  });

  it("notificação do cliente contém resumo do agendamento", async () => {
    const { enviarMensagem: mockEnviar } = jest.requireMock("../services/twilioService");
    sessaoAtual = {
      etapa_atual: "CONFIRMAR",
      dados_coletados: {
        servico_id: "s1", servico_nome: "Corte de Cabelo",
        profissional_id: "p1", profissional_nome: "Carlos Silva",
        data: DATA_ISO, horario: "09:30",
      },
    };

    await enviarMensagem("Ana Beatriz");

    const chamadaCliente = (mockEnviar as jest.Mock).mock.calls.find(
      (c: string[]) => c[1] === "whatsapp:+5511999999999"
    );
    const msgCliente: string = chamadaCliente?.[2] ?? "";

    expect(msgCliente).toContain("Corte de Cabelo");
    expect(msgCliente).toContain("Carlos Silva");
    expect(msgCliente).toContain("09:30");
  });
});

describe("Conversa completa — tratamento de erros e desvios", () => {
  it("tenant inativo não processa mensagem", async () => {
    const mockPrisma = prisma as jest.Mocked<typeof prisma>;
    (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await enviarMensagem("oi");
    expect(mockPrisma.sessaoBot.upsert).not.toHaveBeenCalled();
  });

  it("mensagem vazia é ignorada silenciosamente", async () => {
    const { enviarMensagem: mockEnviar } = jest.requireMock("../services/twilioService");
    await enviarMensagem("   ");
    await new Promise((r) => setTimeout(r, 80));
    expect(mockEnviar).not.toHaveBeenCalled();
  });

  it("opção inválida de serviço não avança a sessão", async () => {
    sessaoAtual = { etapa_atual: "SERVICO", dados_coletados: {} };
    await enviarMensagem("abc");
    expect(sessaoAtual.etapa_atual).toBe("SERVICO");
    const resposta = ultimaResposta();
    expect(resposta).toContain("inválida");
  });

  it("data passada não avança a sessão", async () => {
    sessaoAtual = { etapa_atual: "DATA", dados_coletados: { servico_id: "s1", profissional_id: "p1" } };
    await enviarMensagem("01/01/2020");
    expect(sessaoAtual.etapa_atual).toBe("DATA");
  });

  it("webhook sempre retorna 200 mesmo com erro interno", async () => {
    const mockPrisma = prisma as jest.Mocked<typeof prisma>;
    (mockPrisma.sessaoBot.upsert as jest.Mock).mockRejectedValue(new Error("DB offline"));
    const res = await request(app)
      .post("/webhook/barbearia-teste")
      .type("form")
      .send({ Body: "oi", From: CLIENTE });
    expect(res.status).toBe(200);
  });
});

describe("Ciclo de 2 agendamentos consecutivos", () => {
  it("após CONCLUIDO, nova mensagem reinicia o fluxo", async () => {
    // Primeiro agendamento completo
    sessaoAtual = {
      etapa_atual: "CONFIRMAR",
      dados_coletados: {
        servico_id: "s1", servico_nome: "Corte",
        profissional_id: "p1", profissional_nome: "Carlos",
        data: DATA_ISO, horario: "09:00",
      },
    };
    await enviarMensagem("Bruno Costa");

    // Sessão é resetada para INICIO
    expect(sessaoAtual.etapa_atual).toBe("INICIO");

    // Cliente manda mensagem nova → recebe lista de serviços novamente
    await enviarMensagem("quero agendar de novo");
    const resposta = ultimaResposta();
    expect(resposta).toContain("Corte de Cabelo");
    expect(sessaoAtual.etapa_atual).toBe("SERVICO");
  });
});
