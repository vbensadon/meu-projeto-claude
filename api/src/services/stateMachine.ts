import { prisma } from "../lib/prisma";
import type { ContextoSessao, DadosColetados, Etapa, ResultadoEstado } from "../lib/types";
import type { InteractiveOption } from "../whatsapp/interactiveMessenger";
import { criarAgendamento } from "./agendamentoService";
import { buscarHorariosDisponiveis } from "./calendarService";
import { adicionarNaFila } from "./listaEsperaService";
import {
  MSG_FILA_ESPERA_OFERTA,
  MSG_FILA_ESPERA_NAO_ENTENDIDO,
  MSG_FILA_ESPERA_RECUSADA,
  MSG_FILA_ESPERA_PEDIR_NOME,
  MSG_FILA_ESPERA_CONFIRMACAO,
} from "../constants/messages";

// ── utilitários de data ────────────────────────────────────────────────────

function isoHoje(): string {
  return new Date().toISOString().split("T")[0];
}

function isoAmanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function opcoesData(): InteractiveOption[] {
  return [
    { label: "Hoje", payload: `date:${isoHoje()}` },
    { label: "Amanhã", payload: `date:${isoAmanha()}` },
    { label: "Outra data", payload: "date:custom" },
  ];
}

// ── handlers ────────────────────────────────────────────────────────────────

async function handleInicio(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const servicos = await prisma.servico.findMany({
    where: { tenant_id: ctx.tenantId },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });

  if (servicos.length === 0) {
    return {
      resposta: "Olá! No momento não temos serviços disponíveis. Tente mais tarde.",
      proximaEtapa: "INICIO",
      dadosAtualizados: {},
    };
  }

  const opcoes: InteractiveOption[] = servicos.map((s) => ({
    label: s.nome,
    payload: `service:${s.id}`,
    description: `${s.duracao_minutos}min — R$${Number(s.preco).toFixed(2)}`,
  }));

  return {
    resposta: "Olá! Bem-vindo ao agendamento 😊\n\nEscolha o serviço:",
    opcoes,
    proximaEtapa: "SERVICO",
    dadosAtualizados: {},
  };
}

async function handleServico(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const servicos = await prisma.servico.findMany({
    where: { tenant_id: ctx.tenantId },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });

  let servico = servicos.find(() => false) as (typeof servicos)[0] | undefined;

  if (ctx.payloadType === "service") {
    servico = servicos.find((s) => s.id === ctx.payloadValue);
  } else {
    const idx = parseInt(ctx.mensagemEntrada.trim()) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < servicos.length) servico = servicos[idx];
  }

  if (!servico) {
    const opcoes: InteractiveOption[] = servicos.map((s) => ({
      label: s.nome,
      payload: `service:${s.id}`,
      description: `${s.duracao_minutos}min — R$${Number(s.preco).toFixed(2)}`,
    }));
    return {
      resposta: "Opção inválida. Por favor, escolha um serviço:",
      opcoes,
      proximaEtapa: "SERVICO",
      dadosAtualizados: ctx.dados,
    };
  }

  const profissionais = await prisma.profissional.findMany({
    where: { tenant_id: ctx.tenantId, ativo: true },
    orderBy: { nome: "asc" },
  });

  if (profissionais.length === 0) {
    return {
      resposta: "Não há profissionais disponíveis no momento. Tente mais tarde.",
      proximaEtapa: "INICIO",
      dadosAtualizados: {},
    };
  }

  const opcoes: InteractiveOption[] = profissionais.map((p) => ({
    label: p.nome,
    payload: `barber:${p.id}`,
  }));

  return {
    resposta: `Ótimo! Você escolheu *${servico.nome}*.\n\nAgora, escolha o profissional:`,
    opcoes,
    proximaEtapa: "PROFISSIONAL",
    dadosAtualizados: { ...ctx.dados, servico_id: servico.id, servico_nome: servico.nome },
  };
}

async function handleProfissional(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const profissionais = await prisma.profissional.findMany({
    where: { tenant_id: ctx.tenantId, ativo: true },
    orderBy: { nome: "asc" },
  });

  let prof = profissionais.find(() => false) as (typeof profissionais)[0] | undefined;

  if (ctx.payloadType === "barber") {
    prof = profissionais.find((p) => p.id === ctx.payloadValue);
  } else {
    const idx = parseInt(ctx.mensagemEntrada.trim()) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < profissionais.length) prof = profissionais[idx];
  }

  if (!prof) {
    const opcoes: InteractiveOption[] = profissionais.map((p) => ({
      label: p.nome,
      payload: `barber:${p.id}`,
    }));
    return {
      resposta: "Opção inválida. Escolha o profissional:",
      opcoes,
      proximaEtapa: "PROFISSIONAL",
      dadosAtualizados: ctx.dados,
    };
  }

  return {
    resposta: `Perfeito! *${prof.nome}* selecionado.\n\nQual data você prefere?`,
    opcoes: opcoesData(),
    proximaEtapa: "DATA",
    dadosAtualizados: { ...ctx.dados, profissional_id: prof.id, profissional_nome: prof.nome },
  };
}

async function handleData(ctx: ContextoSessao): Promise<ResultadoEstado> {
  let dataISO: string | null = null;

  if (ctx.payloadType === "date") {
    if (ctx.payloadValue === "custom") {
      return {
        resposta: "Por favor, informe a data no formato DD/MM/AAAA (ex: 15/06/2025).",
        proximaEtapa: "DATA",
        dadosAtualizados: ctx.dados,
      };
    }
    dataISO = ctx.payloadValue ?? null;
  } else {
    const match = ctx.mensagemEntrada.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const [, dia, mes, ano] = match;
      dataISO = `${ano}-${mes}-${dia}`;
    }
  }

  if (!dataISO) {
    return {
      resposta: "Formato de data inválido. Use DD/MM/AAAA ou escolha uma opção:",
      opcoes: opcoesData(),
      proximaEtapa: "DATA",
      dadosAtualizados: ctx.dados,
    };
  }

  if (new Date(`${dataISO}T00:00:00`) < new Date(new Date().toDateString())) {
    return {
      resposta: "Essa data já passou. Por favor, informe uma data futura.",
      opcoes: opcoesData(),
      proximaEtapa: "DATA",
      dadosAtualizados: ctx.dados,
    };
  }

  const horarios = await buscarHorariosDisponiveis(
    ctx.tenantId,
    ctx.dados.profissional_id!,
    dataISO
  );

  const dataFormatada = formatarData(dataISO);

  if (horarios.length === 0) {
    return {
      resposta: MSG_FILA_ESPERA_OFERTA(dataFormatada, ctx.dados.profissional_nome ?? ""),
      opcoes: [
        { label: "Sim, entrar na fila", payload: "waitlist:yes" },
        { label: "Não, obrigado", payload: "waitlist:no" },
      ],
      proximaEtapa: "FILA_ESPERA",
      dadosAtualizados: { ...ctx.dados, data: dataISO },
    };
  }

  const opcoes: InteractiveOption[] = horarios.map((h) => ({
    label: h,
    payload: `slot:${h}`,
  }));

  return {
    resposta: `Horários disponíveis em *${dataFormatada}*:`,
    opcoes,
    proximaEtapa: "HORARIO",
    dadosAtualizados: { ...ctx.dados, data: dataISO },
  };
}

async function handleHorario(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const horarios = await buscarHorariosDisponiveis(
    ctx.tenantId,
    ctx.dados.profissional_id!,
    ctx.dados.data!
  );

  let horario: string | null = null;

  if (ctx.payloadType === "slot") {
    const candidate = ctx.payloadValue ?? "";
    horario = horarios.includes(candidate) ? candidate : null;
  } else {
    const idx = parseInt(ctx.mensagemEntrada.trim()) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < horarios.length) horario = horarios[idx];
  }

  if (!horario) {
    return {
      resposta: "Opção inválida. Escolha um horário:",
      opcoes: horarios.map((h) => ({ label: h, payload: `slot:${h}` })),
      proximaEtapa: "HORARIO",
      dadosAtualizados: ctx.dados,
    };
  }

  const dataFormatada = formatarData(ctx.dados.data!);

  return {
    resposta:
      `Confirme seu agendamento:\n\n` +
      `📋 *Serviço:* ${ctx.dados.servico_nome}\n` +
      `👤 *Profissional:* ${ctx.dados.profissional_nome}\n` +
      `📅 *Data:* ${dataFormatada}\n` +
      `🕐 *Horário:* ${horario}`,
    opcoes: [
      { label: "✅ Confirmar", payload: "confirm:yes" },
      { label: "❌ Cancelar", payload: "confirm:no" },
    ],
    proximaEtapa: "CONFIRMACAO",
    dadosAtualizados: { ...ctx.dados, horario },
  };
}

async function handleConfirmacao(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const input = ctx.mensagemEntrada.trim().toLowerCase();

  const confirmou =
    ctx.payloadType === "confirm"
      ? ctx.payloadValue === "yes"
      : ["sim", "s", "confirmar"].includes(input);

  const cancelou =
    ctx.payloadType === "confirm"
      ? ctx.payloadValue === "no"
      : ["não", "nao", "n", "cancelar"].includes(input);

  if (confirmou) {
    return {
      resposta: "Ótimo! Qual é o seu *nome completo*?",
      proximaEtapa: "CONFIRMAR",
      dadosAtualizados: ctx.dados,
    };
  }

  if (cancelou) {
    return {
      resposta: "Agendamento cancelado. Se quiser recomeçar, é só mandar uma mensagem. 😊",
      proximaEtapa: "CONCLUIDO",
      dadosAtualizados: {},
      concluido: true,
    };
  }

  const dataFormatada = formatarData(ctx.dados.data!);
  return {
    resposta:
      `Não entendi. Por favor, confirme:\n\n` +
      `📋 *Serviço:* ${ctx.dados.servico_nome}\n` +
      `👤 *Profissional:* ${ctx.dados.profissional_nome}\n` +
      `📅 *Data:* ${dataFormatada}\n` +
      `🕐 *Horário:* ${ctx.dados.horario}`,
    opcoes: [
      { label: "✅ Confirmar", payload: "confirm:yes" },
      { label: "❌ Cancelar", payload: "confirm:no" },
    ],
    proximaEtapa: "CONFIRMACAO",
    dadosAtualizados: ctx.dados,
  };
}

async function handleConfirmar(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const nomeCliente = ctx.mensagemEntrada.trim();

  if (nomeCliente.length < 2) {
    return {
      resposta: "Por favor, informe seu nome completo para confirmar o agendamento.",
      proximaEtapa: "CONFIRMAR",
      dadosAtualizados: ctx.dados,
    };
  }

  const dados = { ...ctx.dados, cliente_nome: nomeCliente };

  try {
    await criarAgendamento(ctx.tenantId, ctx.clienteTelefone, dados);
  } catch (err) {
    console.error("[StateMachine] Erro ao criar agendamento:", err);
    return {
      resposta: "Ocorreu um erro ao finalizar o agendamento. Tente novamente.",
      proximaEtapa: "CONFIRMAR",
      dadosAtualizados: ctx.dados,
    };
  }

  const dataFormatada = formatarData(ctx.dados.data!);

  return {
    resposta:
      `✅ *Agendamento confirmado!*\n\n` +
      `Obrigado, *${nomeCliente}*!\n\n` +
      `📋 ${ctx.dados.servico_nome}\n` +
      `👤 ${ctx.dados.profissional_nome}\n` +
      `📅 ${dataFormatada} às ${ctx.dados.horario}\n\n` +
      `Até lá! 😊`,
    proximaEtapa: "CONCLUIDO",
    dadosAtualizados: dados,
    concluido: true,
  };
}

async function handleFilaEspera(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const input = ctx.mensagemEntrada.trim().toLowerCase();

  const entrou =
    ctx.payloadType === "waitlist"
      ? ctx.payloadValue === "yes"
      : ["sim", "s"].includes(input);

  const recusou =
    ctx.payloadType === "waitlist"
      ? ctx.payloadValue === "no"
      : ["não", "nao", "n"].includes(input);

  if (entrou) {
    return {
      resposta: MSG_FILA_ESPERA_PEDIR_NOME,
      proximaEtapa: "FILA_NOME",
      dadosAtualizados: ctx.dados,
    };
  }

  if (recusou) {
    return {
      resposta: MSG_FILA_ESPERA_RECUSADA,
      opcoes: opcoesData(),
      proximaEtapa: "DATA",
      dadosAtualizados: ctx.dados,
    };
  }

  return {
    resposta: MSG_FILA_ESPERA_NAO_ENTENDIDO,
    opcoes: [
      { label: "Sim, entrar na fila", payload: "waitlist:yes" },
      { label: "Não, obrigado", payload: "waitlist:no" },
    ],
    proximaEtapa: "FILA_ESPERA",
    dadosAtualizados: ctx.dados,
  };
}

async function handleFilaNome(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const nomeCliente = ctx.mensagemEntrada.trim();

  if (nomeCliente.length < 2) {
    return {
      resposta: "Por favor, informe seu nome completo.",
      proximaEtapa: "FILA_NOME",
      dadosAtualizados: ctx.dados,
    };
  }

  try {
    await adicionarNaFila({
      tenantId: ctx.tenantId,
      clienteNome: nomeCliente,
      clienteTelefone: ctx.clienteTelefone,
      profissionalId: ctx.dados.profissional_id ?? null,
      servicoId: ctx.dados.servico_id!,
      dataDesejada: new Date(`${ctx.dados.data!}T00:00:00`),
    });
  } catch (err) {
    console.error("[StateMachine] Erro ao adicionar na fila de espera:", err);
    return {
      resposta: "Ocorreu um erro ao entrar na fila de espera. Tente novamente.",
      proximaEtapa: "FILA_NOME",
      dadosAtualizados: ctx.dados,
    };
  }

  return {
    resposta: MSG_FILA_ESPERA_CONFIRMACAO(nomeCliente, formatarData(ctx.dados.data!)),
    proximaEtapa: "CONCLUIDO",
    dadosAtualizados: { ...ctx.dados, cliente_nome: nomeCliente },
    concluido: true,
  };
}

// ── dispatcher ─────────────────────────────────────────────────────────────

const handlers: Record<Etapa, (ctx: ContextoSessao) => Promise<ResultadoEstado>> = {
  INICIO: handleInicio,
  SERVICO: handleServico,
  PROFISSIONAL: handleProfissional,
  DATA: handleData,
  HORARIO: handleHorario,
  CONFIRMACAO: handleConfirmacao,
  CONFIRMAR: handleConfirmar,
  FILA_ESPERA: handleFilaEspera,
  FILA_NOME: handleFilaNome,
  CONCLUIDO: handleInicio,
};

export async function processarMensagem(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const etapaEfetiva: Etapa = ctx.etapa === "CONCLUIDO" ? "INICIO" : ctx.etapa;
  return handlers[etapaEfetiva]({ ...ctx, etapa: etapaEfetiva });
}

export type { DadosColetados };
