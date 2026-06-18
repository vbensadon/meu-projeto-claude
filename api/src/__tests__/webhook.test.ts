import request from "supertest";
import app from "../index";
import { prisma } from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: jest.fn() },
    sessaoBot: { upsert: jest.fn(), update: jest.fn() },
    servico: { findMany: jest.fn() },
    profissional: { findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    agendamento: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  },
}));

jest.mock("../services/twilioService", () => ({
  enviarMensagem: jest.fn().mockResolvedValue(undefined),
  extrairNumero: (raw: string) => raw.replace(/^whatsapp:/, ""),
}));

jest.mock("../services/calendarService", () => ({
  buscarHorariosDisponiveis: jest.fn().mockResolvedValue(["09:00", "10:00"]),
  criarEventoCalendar: jest.fn().mockResolvedValue(null),
}));

jest.mock("../services/lembreteService", () => ({
  tratarRespostaLembrete: jest.fn().mockResolvedValue(null),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const TENANT = {
  id: "tenant-1",
  slug: "barbearia-demo",
  ativo: true,
  twilio_account_sid: "ACtest",
  twilio_auth_token: "token",
  telefone_whatsapp: "whatsapp:+14155238886",
};

function twilioPOST(slug: string, body: string, from = "whatsapp:+5511999999999") {
  return request(app)
    .post(`/webhook/${slug}`)
    .type("form")
    .send({ Body: body, From: from });
}

beforeEach(() => {
  jest.clearAllMocks();
  (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(TENANT);
  (mockPrisma.sessaoBot.upsert as jest.Mock).mockResolvedValue({
    etapa_atual: "INICIO",
    dados_coletados: {},
  });
  (mockPrisma.sessaoBot.update as jest.Mock).mockResolvedValue({});
  (mockPrisma.servico.findMany as jest.Mock).mockResolvedValue([
    { id: "s1", nome: "Corte", duracao_minutos: 30, preco: 35 },
  ]);
  (mockPrisma.profissional.findMany as jest.Mock).mockResolvedValue([
    { id: "p1", nome: "Carlos", ativo: true },
  ]);
});

describe("Webhook POST /webhook/:tenantSlug", () => {
  it("retorna 200 imediatamente (Twilio não espera body)", async () => {
    const res = await twilioPOST("barbearia-demo", "oi");
    expect(res.status).toBe(200);
  });

  it("ignora tenant inexistente sem lançar erro", async () => {
    (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await twilioPOST("slug-invalido", "oi");
    expect(res.status).toBe(200);
  });

  it("inicia conversa com lista de serviços", async () => {
    const { enviarMensagem } = await import("../services/twilioService");
    await twilioPOST("barbearia-demo", "oi");

    // Aguarda o processamento assíncrono
    await new Promise((r) => setTimeout(r, 50));

    expect(enviarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({ accountSid: "ACtest" }),
      "whatsapp:+5511999999999",
      expect.stringContaining("Corte")
    );
  });
});

describe("Webhook — intercepção de respostas de lembrete (CONFIRMAR/CANCELAR)", () => {
  it("quando tratarRespostaLembrete retorna mensagem, usa-a em vez do fluxo do bot", async () => {
    const { tratarRespostaLembrete } = await import("../services/lembreteService");
    const { enviarMensagem } = await import("../services/twilioService");
    (tratarRespostaLembrete as jest.Mock).mockResolvedValueOnce("✅ Combinado! Seu agendamento está confirmado.");

    await twilioPOST("barbearia-demo", "CONFIRMAR");
    await new Promise((r) => setTimeout(r, 50));

    expect(enviarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({ accountSid: "ACtest" }),
      "whatsapp:+5511999999999",
      "✅ Combinado! Seu agendamento está confirmado."
    );
    // estado machine não é chamado — nenhuma atualização de sessão
    expect(mockPrisma.sessaoBot.update).not.toHaveBeenCalled();
  });

  it("quando tratarRespostaLembrete retorna null, segue o fluxo normal do bot", async () => {
    const { tratarRespostaLembrete } = await import("../services/lembreteService");
    (tratarRespostaLembrete as jest.Mock).mockResolvedValueOnce(null);

    const { enviarMensagem } = await import("../services/twilioService");
    await twilioPOST("barbearia-demo", "oi");
    await new Promise((r) => setTimeout(r, 50));

    expect(enviarMensagem).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining("Corte")
    );
  });
});
