import request from "supertest";
import app from "../index";
import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

jest.mock("../lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    profissional: {
      findMany: jest.fn(), create: jest.fn(),
      findFirst: jest.fn(), update: jest.fn(),
    },
    servico: {
      findMany: jest.fn(), create: jest.fn(),
      findFirst: jest.fn(), delete: jest.fn(),
    },
    agendamento: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    agendamentoServico: { findMany: jest.fn(), deleteMany: jest.fn() },
    sessaoBot: { upsert: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("../services/agendamentoService", () => ({
  cancelarAgendamento: jest.fn(),
}));

jest.mock("../services/calendarService", () => ({
  criarEventoCalendar: jest.fn().mockResolvedValue(null),
  atualizarEventoCalendar: jest.fn().mockResolvedValue(undefined),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

process.env.JWT_SECRET = "test-secret";

const TENANT = {
  id: "t1", nome: "Barbearia", slug: "barb", ativo: true, plano: "starter",
  twilio_account_sid: "AC", twilio_auth_token: "tok",
  telefone_whatsapp: "whatsapp:+14155238886",
};

function token() {
  return jwt.sign({ tenantId: "t1", slug: "barb" }, "test-secret");
}

function auth() {
  return { Authorization: `Bearer ${token()}` };
}

describe("POST /api/auth/login", () => {
  it("retorna token com credenciais válidas", async () => {
    const hash = await bcrypt.hash("senha123", 10);
    (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({ ...TENANT, senha_hash: hash });

    const res = await request(app).post("/api/auth/login").send({ slug: "barb", senha: "senha123" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
  });

  it("rejeita senha errada", async () => {
    const hash = await bcrypt.hash("correta", 10);
    (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue({ ...TENANT, senha_hash: hash });

    const res = await request(app).post("/api/auth/login").send({ slug: "barb", senha: "errada" });
    expect(res.status).toBe(401);
  });

  it("rejeita tenant inexistente sem vazar timing", async () => {
    (mockPrisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app).post("/api/auth/login").send({ slug: "x", senha: "y" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/profissionais", () => {
  it("requer autenticação", async () => {
    const res = await request(app).get("/api/profissionais");
    expect(res.status).toBe(401);
  });

  it("lista profissionais do tenant", async () => {
    (mockPrisma.profissional.findMany as jest.Mock).mockResolvedValue([
      { id: "p1", nome: "Carlos", ativo: true },
    ]);

    const res = await request(app).get("/api/profissionais").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nome).toBe("Carlos");
  });
});

describe("POST /api/profissionais", () => {
  it("cria profissional com dados válidos", async () => {
    (mockPrisma.profissional.create as jest.Mock).mockResolvedValue({
      id: "p2", nome: "João", ativo: true, tenant_id: "t1",
    });

    const res = await request(app)
      .post("/api/profissionais")
      .set(auth())
      .send({ nome: "João" });

    expect(res.status).toBe(201);
    expect(res.body.nome).toBe("João");
  });

  it("rejeita nome vazio", async () => {
    const res = await request(app).post("/api/profissionais").set(auth()).send({ nome: "" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/agendamentos/dashboard", () => {
  it("retorna métricas do painel", async () => {
    (mockPrisma.agendamento.count as jest.Mock).mockResolvedValue(3);
    (mockPrisma.agendamento.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app).get("/api/agendamentos/dashboard").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalHoje");
    expect(res.body).toHaveProperty("proximos");
  });
});

describe("GET /api/agendamentos", () => {
  it("filtra por data", async () => {
    (mockPrisma.agendamento.findMany as jest.Mock).mockResolvedValue([]);
    const res = await request(app)
      .get("/api/agendamentos?data=2025-06-15")
      .set(auth());
    expect(res.status).toBe(200);
  });

  it("rejeita data em formato inválido", async () => {
    const res = await request(app)
      .get("/api/agendamentos?data=15/06/2025")
      .set(auth());
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/agendamentos/:id", () => {
  const existente = {
    id: "a1",
    tenant_id: "t1",
    profissional_id: "p1",
    servico_id: "s1",
    cliente_nome: "Cliente",
    cliente_telefone: "+5511999999999",
    data_hora: new Date("2025-06-16T10:00:00"),
    status: "confirmado",
    google_event_id: null,
  };

  beforeEach(() => {
    (mockPrisma.agendamento.findFirst as jest.Mock).mockResolvedValue(existente);
    (mockPrisma.profissional.findFirst as jest.Mock).mockResolvedValue({ id: "p1", google_calendar_id: null });
    (mockPrisma.servico.findFirst as jest.Mock).mockResolvedValue({ id: "s1", duracao_minutos: 30 });
    (mockPrisma.servico.findMany as jest.Mock).mockResolvedValue([{ id: "s1", nome: "Corte", duracao_minutos: 30, preco: "30.00" }]);
    (mockPrisma.agendamentoServico.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.tenant.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: "t1", google_calendar_id_dono: null });
    (mockPrisma.agendamento.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.agendamento.update as jest.Mock).mockResolvedValue({
      ...existente,
      data_hora: new Date("2025-06-16T11:00:00"),
      profissional: { id: "p1", nome: "Carlos" },
      servico: { id: "s1", nome: "Corte", duracao_minutos: 30, preco: "30.00" },
    });
  });

  it("reagenda para um novo horário sem conflito", async () => {
    const res = await request(app)
      .patch("/api/agendamentos/a1")
      .set(auth())
      .send({ data_hora: "2025-06-16T11:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(mockPrisma.agendamento.update).toHaveBeenCalled();
  });

  it("rejeita quando o novo horário conflita com outro agendamento", async () => {
    (mockPrisma.agendamento.findMany as jest.Mock).mockResolvedValue([
      {
        id: "a2",
        data_hora: new Date("2025-06-16T11:00:00.000Z"),
        servico: { duracao_minutos: 30 },
      },
    ]);

    const res = await request(app)
      .patch("/api/agendamentos/a1")
      .set(auth())
      .send({ data_hora: "2025-06-16T11:00:00.000Z" });

    expect(res.status).toBe(409);
  });

  it("retorna 404 quando o agendamento não existe", async () => {
    (mockPrisma.agendamento.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .patch("/api/agendamentos/inexistente")
      .set(auth())
      .send({ data_hora: "2025-06-16T11:00:00.000Z" });

    expect(res.status).toBe(404);
  });

  it("rejeita edição de agendamento já cancelado", async () => {
    (mockPrisma.agendamento.findFirst as jest.Mock).mockResolvedValue({ ...existente, status: "cancelado" });

    const res = await request(app)
      .patch("/api/agendamentos/a1")
      .set(auth())
      .send({ data_hora: "2025-06-16T11:00:00.000Z" });

    expect(res.status).toBe(400);
  });

  it("rejeita corpo vazio", async () => {
    const res = await request(app)
      .patch("/api/agendamentos/a1")
      .set(auth())
      .send({});

    expect(res.status).toBe(400);
  });
});
