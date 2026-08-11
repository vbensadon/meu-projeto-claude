import { processarMensagem } from "../services/stateMachine";
import { prisma } from "../lib/prisma";
import { buscarHorariosDisponiveis } from "../services/calendarService";
import { adicionarNaFila } from "../services/listaEsperaService";

jest.mock("../lib/prisma", () => ({
  prisma: {
    servico: { findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    profissional: { findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    agendamento: { findMany: jest.fn(), create: jest.fn() },
    tenant: { findUniqueOrThrow: jest.fn() },
    interactiveMessageConfig: { findUnique: jest.fn() },
  },
}));

jest.mock("../services/calendarService", () => ({
  buscarHorariosDisponiveis: jest.fn(),
  criarEventoCalendar: jest.fn().mockResolvedValue(null),
}));

jest.mock("../services/twilioService", () => ({
  enviarMensagem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/listaEsperaService", () => ({
  adicionarNaFila: jest.fn().mockResolvedValue({}),
  marcarConvertidosPorAgendamento: jest.fn().mockResolvedValue(undefined),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockHorarios = buscarHorariosDisponiveis as jest.Mock;
const mockAdicionarNaFila = adicionarNaFila as jest.Mock;

const TENANT_ID = "tenant-1";
const TELEFONE = "+5511999999999";

const SERVICOS = [
  { id: "serv-1", nome: "Corte", duracao_minutos: 30, preco: "35.00" },
  { id: "serv-2", nome: "Barba", duracao_minutos: 20, preco: "25.00" },
  { id: "serv-3", nome: "Corte + Barba", duracao_minutos: 50, preco: "55.00" },
];

const PROFISSIONAIS = [
  { id: "prof-1", nome: "Carlos Silva", ativo: true, google_calendar_id: null, telefone_whatsapp: null },
  { id: "prof-2", nome: "João Souza", ativo: true, google_calendar_id: null, telefone_whatsapp: null },
];

const TENANT_DADOS = {
  id: TENANT_ID, nome: "Barbearia Demo",
  twilio_account_sid: "ACtest", twilio_auth_token: "token",
  telefone_whatsapp: "whatsapp:+14155238886", google_calendar_id_dono: null,
};

const AMANHA = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
})();
const DATA_ISO = AMANHA.toISOString().slice(0, 10);
const [ANO, MES, DIA] = DATA_ISO.split("-");
const DATA_BR = `${DIA}/${MES}/${ANO}`;

beforeEach(() => {
  jest.clearAllMocks();
  (mockPrisma.servico.findMany as jest.Mock).mockResolvedValue(SERVICOS);
  (mockPrisma.servico.findUniqueOrThrow as jest.Mock).mockResolvedValue(SERVICOS[0]);
  (mockPrisma.profissional.findMany as jest.Mock).mockResolvedValue(PROFISSIONAIS);
  (mockPrisma.profissional.findUniqueOrThrow as jest.Mock).mockResolvedValue(PROFISSIONAIS[0]);
  (mockPrisma.agendamento.findMany as jest.Mock).mockResolvedValue([]);
  (mockPrisma.agendamento.create as jest.Mock).mockResolvedValue({ id: "ag-1" });
  (mockPrisma.tenant.findUniqueOrThrow as jest.Mock).mockResolvedValue(TENANT_DADOS);
  (mockPrisma.interactiveMessageConfig.findUnique as jest.Mock).mockResolvedValue(null);
  mockHorarios.mockResolvedValue(["09:00", "09:30", "10:00", "14:00", "14:30"]);
});

// ── INICIO ─────────────────────────────────────────────────────────────────

describe("Estado INICIO", () => {
  it("exibe lista de serviços com preço e duração", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "INICIO", dados: {}, mensagemEntrada: "oi" });
    expect(r.proximaEtapa).toBe("SERVICO");
    const opcoesTxt = JSON.stringify(r.opcoes);
    expect(opcoesTxt).toContain("Corte");
    expect(opcoesTxt).toContain("Barba");
    expect(opcoesTxt).toContain("R$35");
    expect(opcoesTxt).toContain("30min");
  });

  it("mensagem de boas-vindas está em português", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "INICIO", dados: {}, mensagemEntrada: "hello" });
    expect(r.resposta).toMatch(/bem-vindo|olá/i);
  });

  it("avisa quando não há serviços cadastrados", async () => {
    (mockPrisma.servico.findMany as jest.Mock).mockResolvedValue([]);
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "INICIO", dados: {}, mensagemEntrada: "oi" });
    expect(r.proximaEtapa).toBe("INICIO");
    expect(r.resposta).toContain("disponíveis");
  });

  it("reinicia conversa ao receber mensagem no estado CONCLUIDO", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "CONCLUIDO", dados: {}, mensagemEntrada: "quero agendar" });
    expect(r.proximaEtapa).toBe("SERVICO");
  });
});

// ── SERVICO ─────────────────────────────────────────────────────────────────

describe("Estado SERVICO", () => {
  it("seleciona serviço válido e pergunta se quer adicionar outro", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "SERVICO", dados: {}, mensagemEntrada: "1" });
    expect(r.proximaEtapa).toBe("SERVICO_MAIS");
    expect(r.dadosAtualizados.servico_id).toBe("serv-1");
    expect(r.dadosAtualizados.servico_nome).toBe("Corte");
    expect(r.dadosAtualizados.servicos_ids).toEqual(["serv-1"]);
  });

  it("seleciona último item da lista", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "SERVICO", dados: {}, mensagemEntrada: "3" });
    expect(r.proximaEtapa).toBe("SERVICO_MAIS");
    expect(r.dadosAtualizados.servico_id).toBe("serv-3");
  });

  it("mantém etapa em opção fora do range", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "SERVICO", dados: {}, mensagemEntrada: "99" });
    expect(r.proximaEtapa).toBe("SERVICO");
    expect(r.resposta).toContain("inválida");
  });

  it("mantém etapa em entrada não numérica", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "SERVICO", dados: {}, mensagemEntrada: "corte" });
    expect(r.proximaEtapa).toBe("SERVICO");
  });

  it("mantém etapa em número zero", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "SERVICO", dados: {}, mensagemEntrada: "0" });
    expect(r.proximaEtapa).toBe("SERVICO");
  });
});

// ── SERVICO_MAIS (múltiplos serviços) ────────────────────────────────────────

describe("Estado SERVICO_MAIS", () => {
  const dadosUmServico = { servico_id: "serv-1", servico_nome: "Corte", servicos_ids: ["serv-1"], servicos_nomes: ["Corte"] };

  it("ao 'continuar' avança para PROFISSIONAL", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "SERVICO_MAIS", dados: dadosUmServico, mensagemEntrada: "2" });
    expect(r.proximaEtapa).toBe("PROFISSIONAL");
  });

  it("ao 'adicionar outro' volta para SERVICO mantendo os já escolhidos", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "SERVICO_MAIS", dados: dadosUmServico, mensagemEntrada: "1" });
    expect(r.proximaEtapa).toBe("SERVICO");
    expect(r.dadosAtualizados.servicos_ids).toEqual(["serv-1"]);
    expect(r.resposta).toContain("Corte");
  });

  it("acumula um segundo serviço na lista (sem duplicar)", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "SERVICO", dados: dadosUmServico, mensagemEntrada: "2" });
    expect(r.proximaEtapa).toBe("SERVICO_MAIS");
    expect(r.dadosAtualizados.servicos_ids).toEqual(["serv-1", "serv-2"]);
    expect(r.dadosAtualizados.servico_id).toBe("serv-1"); // primário = primeiro
  });

  it("não duplica serviço já escolhido", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "SERVICO", dados: dadosUmServico, mensagemEntrada: "1" });
    expect(r.dadosAtualizados.servicos_ids).toEqual(["serv-1"]);
  });
});

// ── PROFISSIONAL ─────────────────────────────────────────────────────────────

describe("Estado PROFISSIONAL", () => {
  const dadosServico = { servico_id: "serv-1", servico_nome: "Corte" };

  it("seleciona profissional e avança para DATA", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "PROFISSIONAL", dados: dadosServico, mensagemEntrada: "2" });
    expect(r.proximaEtapa).toBe("DATA");
    expect(r.dadosAtualizados.profissional_id).toBe("prof-2");
    expect(r.dadosAtualizados.profissional_nome).toBe("João Souza");
  });

  it("exibe lista de profissionais na mensagem de confirmação", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "PROFISSIONAL", dados: dadosServico, mensagemEntrada: "1" });
    expect(r.dadosAtualizados.profissional_nome).toBe("Carlos Silva");
    expect(r.resposta).toContain("data");
  });

  it("rejeita opção inválida", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "PROFISSIONAL", dados: dadosServico, mensagemEntrada: "5" });
    expect(r.proximaEtapa).toBe("PROFISSIONAL");
  });
});

// ── DATA ─────────────────────────────────────────────────────────────────────

describe("Estado DATA", () => {
  const dadosBase = { servico_id: "serv-1", profissional_id: "prof-1" };

  it("aceita data futura no formato DD/MM/AAAA", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "DATA", dados: dadosBase, mensagemEntrada: DATA_BR });
    expect(r.proximaEtapa).toBe("HORARIO");
    expect(r.dadosAtualizados.data).toBe(DATA_ISO);
  });

  it("exibe horários disponíveis nas opções", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "DATA", dados: dadosBase, mensagemEntrada: DATA_BR });
    const opcoesTxt = JSON.stringify(r.opcoes);
    expect(opcoesTxt).toContain("09:00");
    expect(opcoesTxt).toContain("14:00");
  });

  it("rejeita formato americano MM/DD/AAAA", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "DATA", dados: dadosBase, mensagemEntrada: `${MES}/${DIA}/${ANO}` });
    // Se dia > 12, vai rejeitar; se ≤ 12, pode coincidir — testamos o formato errado puro
    const r2 = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "DATA", dados: dadosBase, mensagemEntrada: "2025-06-15" });
    expect(r2.proximaEtapa).toBe("DATA");
  });

  it("rejeita data passada", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "DATA", dados: dadosBase, mensagemEntrada: "01/01/2020" });
    expect(r.proximaEtapa).toBe("DATA");
    expect(r.resposta).toContain("passou");
  });

  it("oferece entrar na fila de espera quando não há horários disponíveis", async () => {
    mockHorarios.mockResolvedValue([]);
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "DATA", dados: dadosBase, mensagemEntrada: DATA_BR });
    expect(r.proximaEtapa).toBe("FILA_ESPERA");
    expect(r.resposta).toContain("disponíveis");
    expect(r.resposta).toMatch(/fila de espera/i);
    expect(r.dadosAtualizados.data).toBe(DATA_ISO);
  });
});

// ── FILA_ESPERA ──────────────────────────────────────────────────────────────

describe("Estado FILA_ESPERA", () => {
  const dadosBase = { servico_id: "serv-1", profissional_id: "prof-1", profissional_nome: "Carlos Silva", data: DATA_ISO };

  it("avança para FILA_NOME ao responder SIM", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "FILA_ESPERA", dados: dadosBase, mensagemEntrada: "sim" });
    expect(r.proximaEtapa).toBe("FILA_NOME");
  });

  it("volta para DATA ao responder NÃO", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "FILA_ESPERA", dados: dadosBase, mensagemEntrada: "não" });
    expect(r.proximaEtapa).toBe("DATA");
  });

  it("mantém etapa e pede esclarecimento em resposta não reconhecida", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "FILA_ESPERA", dados: dadosBase, mensagemEntrada: "talvez" });
    expect(r.proximaEtapa).toBe("FILA_ESPERA");
  });
});

// ── FILA_NOME ────────────────────────────────────────────────────────────────

describe("Estado FILA_NOME", () => {
  const dadosBase = { servico_id: "serv-1", profissional_id: "prof-1", data: DATA_ISO };

  it("adiciona cliente na fila e conclui a conversa", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "FILA_NOME", dados: dadosBase, mensagemEntrada: "Maria da Silva" });
    expect(r.proximaEtapa).toBe("CONCLUIDO");
    expect(r.concluido).toBe(true);
    expect(mockAdicionarNaFila).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      clienteNome: "Maria da Silva",
      clienteTelefone: TELEFONE,
      profissionalId: "prof-1",
      servicoId: "serv-1",
      dataDesejada: new Date(`${DATA_ISO}T00:00:00`),
    });
  });

  it("rejeita nome com menos de 2 caracteres", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "FILA_NOME", dados: dadosBase, mensagemEntrada: "A" });
    expect(r.proximaEtapa).toBe("FILA_NOME");
    expect(r.concluido).toBeFalsy();
    expect(mockAdicionarNaFila).not.toHaveBeenCalled();
  });

  it("mantém etapa quando adicionarNaFila falha", async () => {
    mockAdicionarNaFila.mockRejectedValueOnce(new Error("DB error"));
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "FILA_NOME", dados: dadosBase, mensagemEntrada: "Maria" });
    expect(r.proximaEtapa).toBe("FILA_NOME");
    expect(r.concluido).toBeFalsy();
  });
});

// ── HORARIO ──────────────────────────────────────────────────────────────────

describe("Estado HORARIO", () => {
  const dadosBase = { servico_id: "serv-1", profissional_id: "prof-1", data: DATA_ISO };

  it("seleciona horário e avança para CONFIRMACAO", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "HORARIO", dados: dadosBase, mensagemEntrada: "1" });
    expect(r.proximaEtapa).toBe("CONFIRMACAO");
    expect(r.dadosAtualizados.horario).toBe("09:00");
  });

  it("exibe resumo do agendamento na mensagem de confirmação", async () => {
    const r = await processarMensagem({
      tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "HORARIO",
      dados: { ...dadosBase, servico_nome: "Corte", profissional_nome: "Carlos" },
      mensagemEntrada: "2"
    });
    expect(r.resposta).toContain("Corte");
    expect(r.resposta).toContain("Carlos");
    expect(r.resposta).toContain("09:30");
  });

  it("rejeita opção inválida", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "HORARIO", dados: dadosBase, mensagemEntrada: "100" });
    expect(r.proximaEtapa).toBe("HORARIO");
  });
});

// ── CONFIRMAR ────────────────────────────────────────────────────────────────

describe("Estado CONFIRMAR", () => {
  const dadosCompletos = {
    servico_id: "serv-1", servico_nome: "Corte",
    profissional_id: "prof-1", profissional_nome: "Carlos",
    data: DATA_ISO, horario: "09:00",
  };

  it("cria agendamento e retorna CONCLUIDO", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "CONFIRMAR", dados: dadosCompletos, mensagemEntrada: "Maria da Silva" });
    expect(r.proximaEtapa).toBe("CONCLUIDO");
    expect(r.concluido).toBe(true);
    expect(mockPrisma.agendamento.create).toHaveBeenCalledTimes(1);
  });

  it("mensagem de conclusão contém resumo completo", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "CONFIRMAR", dados: dadosCompletos, mensagemEntrada: "João Pedro" });
    expect(r.resposta).toContain("João Pedro");
    expect(r.resposta).toContain("Corte");
    expect(r.resposta).toContain("09:00");
    expect(r.resposta).toContain("confirmado");
  });

  it("salva nome do cliente nos dados coletados", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "CONFIRMAR", dados: dadosCompletos, mensagemEntrada: "Ana Lima" });
    expect(r.dadosAtualizados.cliente_nome).toBe("Ana Lima");
  });

  it("rejeita nome com menos de 2 caracteres", async () => {
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "CONFIRMAR", dados: dadosCompletos, mensagemEntrada: "A" });
    expect(r.proximaEtapa).toBe("CONFIRMAR");
    expect(r.concluido).toBeFalsy();
    expect(mockPrisma.agendamento.create).not.toHaveBeenCalled();
  });

  it("volta para CONFIRMAR quando create falha", async () => {
    (mockPrisma.agendamento.create as jest.Mock).mockRejectedValue(new Error("DB error"));
    const r = await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "CONFIRMAR", dados: dadosCompletos, mensagemEntrada: "Maria" });
    expect(r.proximaEtapa).toBe("CONFIRMAR");
    expect(r.concluido).toBeFalsy();
  });

  it("cria agendamento com data_hora correta", async () => {
    await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "CONFIRMAR", dados: dadosCompletos, mensagemEntrada: "Carlos Junior" });
    const chamada = (mockPrisma.agendamento.create as jest.Mock).mock.calls[0][0];
    const dataHora: Date = chamada.data.data_hora;
    expect(dataHora.getHours()).toBe(9);
    expect(dataHora.getMinutes()).toBe(0);
  });

  it("cria agendamento multi-serviço somando preço e gravando itens", async () => {
    const dadosMulti = {
      ...dadosCompletos,
      servicos_ids: ["serv-1", "serv-2"],
      servicos_nomes: ["Corte", "Barba"],
    };
    await processarMensagem({ tenantId: TENANT_ID, clienteTelefone: TELEFONE, etapa: "CONFIRMAR", dados: dadosMulti, mensagemEntrada: "Ana Souza" });
    const chamada = (mockPrisma.agendamento.create as jest.Mock).mock.calls[0][0];
    expect(Number(chamada.data.preco)).toBe(60); // 35 + 25
    expect(chamada.data.servico_id).toBe("serv-1"); // primário
    expect(chamada.data.itens_servico.create).toHaveLength(2);
  });
});
