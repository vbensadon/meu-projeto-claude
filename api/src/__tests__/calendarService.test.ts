import { buscarHorariosDisponiveis } from "../services/calendarService";
import { prisma } from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  prisma: {
    profissional: { findUniqueOrThrow: jest.fn() },
    agendamento: { findMany: jest.fn() },
    bloqueio: { findMany: jest.fn() },
  },
}));

// Google Calendar indisponível em testes — cai no fallback do banco
jest.mock("../lib/googleAuth", () => ({
  obterClienteAutenticado: jest.fn().mockRejectedValue(new Error("sem token")),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const AMANHA = new Date();
AMANHA.setDate(AMANHA.getDate() + 1);
const DATA_ISO = AMANHA.toISOString().slice(0, 10);

beforeEach(() => {
  jest.clearAllMocks();
  (mockPrisma.profissional.findUniqueOrThrow as jest.Mock).mockResolvedValue({
    id: "prof-1",
    google_calendar_id: null,
  });
  (mockPrisma.agendamento.findMany as jest.Mock).mockResolvedValue([]);
  (mockPrisma.bloqueio.findMany as jest.Mock).mockResolvedValue([]);
});

describe("buscarHorariosDisponiveis", () => {
  it("retorna slots de 08:00 a 17:30 quando não há agendamentos", async () => {
    const slots = await buscarHorariosDisponiveis("t1", "prof-1", DATA_ISO);
    expect(slots).toContain("08:00");
    expect(slots).toContain("17:30");
    expect(slots).not.toContain("18:00");
    expect(slots.length).toBe(20); // 08:00 - 17:30, de 30 em 30
  });

  it("bloqueia slot ocupado por agendamento", async () => {
    const agendamento = new Date(`${DATA_ISO}T09:00:00`);
    (mockPrisma.agendamento.findMany as jest.Mock).mockResolvedValue([
      {
        data_hora: agendamento,
        servico: { duracao_minutos: 60 },
      },
    ]);

    const slots = await buscarHorariosDisponiveis("t1", "prof-1", DATA_ISO);
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:30");
    expect(slots).toContain("10:00"); // libera após o fim
  });

  it("bloqueia múltiplos agendamentos independentes", async () => {
    const ag1 = new Date(`${DATA_ISO}T08:00:00`);
    const ag2 = new Date(`${DATA_ISO}T11:00:00`);

    (mockPrisma.agendamento.findMany as jest.Mock).mockResolvedValue([
      { data_hora: ag1, servico: { duracao_minutos: 30 } },
      { data_hora: ag2, servico: { duracao_minutos: 30 } },
    ]);

    const slots = await buscarHorariosDisponiveis("t1", "prof-1", DATA_ISO);
    expect(slots).not.toContain("08:00");
    expect(slots).toContain("08:30");
    expect(slots).not.toContain("11:00");
    expect(slots).toContain("11:30");
  });

  it("bloqueia slot coberto por um bloqueio de agenda (almoço/folga)", async () => {
    const inicio = new Date(`${DATA_ISO}T12:00:00`);
    const fim = new Date(`${DATA_ISO}T13:00:00`);
    (mockPrisma.bloqueio.findMany as jest.Mock).mockResolvedValue([{ inicio, fim }]);

    const slots = await buscarHorariosDisponiveis("t1", "prof-1", DATA_ISO);
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("12:30");
    expect(slots).toContain("13:00");
  });
});
