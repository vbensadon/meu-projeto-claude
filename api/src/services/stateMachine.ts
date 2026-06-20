import { prisma } from "../lib/prisma";
import type { ContextoSessao, DadosColetados, Etapa, ResultadoEstado } from "../lib/types";
import type { InteractiveOption } from "../whatsapp/interactiveMessenger";
import type { EtapaConversa } from "@prisma/client";
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

// ── config customizada por tenant ─────────────────────────────────────────

async function getTexto(
  tenantId: string,
  etapa: EtapaConversa,
  padrao: string,
  vars: Record<string, string> = {}
): Promise<string> {
  const config = await prisma.interactiveMessageConfig.findUnique({
    where: { tenant_id_etapa: { tenant_id: tenantId, etapa } },
    select: { corpo_texto: true, ativo: true },
  });
  const template = config?.ativo ? (config.corpo_texto || padrao) : padrao;
  return Object.entries(vars).reduce((t, [k, v]) => t.split(`{${k}}`).join(v), template);
}

async function getLabels(
  tenantId: string,
  etapa: EtapaConversa,
  padrao: string[]
): Promise<string[]> {
  const config = await prisma.interactiveMessageConfig.findUnique({
    where: { tenant_id_etapa: { tenant_id: tenantId, etapa } },
    select: { labels_botoes: true },
  });
  const arr = config?.labels_botoes as string[] | null;
  return arr && arr.length > 0 ? arr : padrao;
}

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

// ── builders reutilizáveis ─────────────────────────────────────────────────

async function buildServicos(tenantId: string): Promise<InteractiveOption[]> {
  const servicos = await prisma.servico.findMany({
    where: { tenant_id: tenantId },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  // reserva 1 slot para "↩ Voltar" → máximo 9 serviços
  return servicos.slice(0, 9).map((s) => ({
    label: s.nome,
    payload: `service:${s.id}`,
    description: `${s.duracao_minutos}min — R$${Number(s.preco).toFixed(2)}`,
  }));
}

async function buildProfissionais(tenantId: string): Promise<InteractiveOption[]> {
  const profs = await prisma.profissional.findMany({
    where: { tenant_id: tenantId, ativo: true },
    orderBy: { nome: "asc" },
  });
  return profs.slice(0, 9).map((p) => ({
    label: p.nome,
    payload: `barber:${p.id}`,
  }));
}

async function buildOpcoesData(tenantId: string): Promise<InteractiveOption[]> {
  const [labelHoje, labelAmanha, labelOutra] = await getLabels(
    tenantId, "ESCOLHA_DATA", ["Hoje", "Amanhã", "Outra data"]
  );
  return [
    { label: labelHoje,   payload: `date:${isoHoje()}` },
    { label: labelAmanha, payload: `date:${isoAmanha()}` },
    { label: labelOutra,  payload: "date:custom" },
    { label: "↩ Voltar",  payload: "nav:back" },
  ];
}

async function buildHorarios(
  tenantId: string,
  profissionalId: string,
  dataISO: string
): Promise<InteractiveOption[] | null> {
  const horarios = await buscarHorariosDisponiveis(tenantId, profissionalId, dataISO);
  if (horarios.length === 0) return null;
  return [
    ...horarios.slice(0, 9).map((h) => ({ label: h, payload: `slot:${h}` })),
    { label: "↩ Voltar", payload: "nav:back" },
  ];
}

// ── handlers ────────────────────────────────────────────────────────────────

async function handleInicio(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const opcoesServico = await buildServicos(ctx.tenantId);

  if (opcoesServico.length === 0) {
    return {
      resposta: "Olá! No momento não temos serviços disponíveis. Tente mais tarde.",
      proximaEtapa: "INICIO",
      dadosAtualizados: {},
    };
  }

  const texto = await getTexto(
    ctx.tenantId, "BOAS_VINDAS",
    "Olá! Bem-vindo ao agendamento 😊\n\nEscolha o serviço:"
  );
  return { resposta: texto, opcoes: opcoesServico, proximaEtapa: "SERVICO", dadosAtualizados: {} };
}

async function handleServico(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const servicos = await prisma.servico.findMany({
    where: { tenant_id: ctx.tenantId },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });

  let servico: (typeof servicos)[0] | undefined;

  if (ctx.payloadType === "service") {
    servico = servicos.find((s) => s.id === ctx.payloadValue);
  } else {
    const idx = parseInt(ctx.mensagemEntrada.trim()) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < servicos.length) servico = servicos[idx];
  }

  if (!servico) {
    const opcoes = await buildServicos(ctx.tenantId);
    return {
      resposta: "Opção inválida. Por favor, escolha um serviço:",
      opcoes,
      proximaEtapa: "SERVICO",
      dadosAtualizados: ctx.dados,
    };
  }

  const profOpcoes = await buildProfissionais(ctx.tenantId);

  if (profOpcoes.length === 0) {
    return {
      resposta: "Não há profissionais disponíveis no momento. Tente mais tarde.",
      proximaEtapa: "INICIO",
      dadosAtualizados: {},
    };
  }

  const texto = await getTexto(
    ctx.tenantId, "ESCOLHA_PROFISSIONAL",
    `Ótimo! Você escolheu *${servico.nome}*.\n\nAgora, escolha o profissional:`,
    { serviceName: servico.nome }
  );
  return {
    resposta: texto,
    opcoes: [...profOpcoes, { label: "↩ Início", payload: "nav:back" }],
    proximaEtapa: "PROFISSIONAL",
    dadosAtualizados: { ...ctx.dados, servico_id: servico.id, servico_nome: servico.nome },
  };
}

async function handleProfissional(ctx: ContextoSessao): Promise<ResultadoEstado> {
  // ← Voltar → recomeça do início
  if (ctx.payloadType === "nav" && ctx.payloadValue === "back") {
    return handleInicio({ ...ctx, etapa: "INICIO" });
  }

  const profissionais = await prisma.profissional.findMany({
    where: { tenant_id: ctx.tenantId, ativo: true },
    orderBy: { nome: "asc" },
  });

  let prof: (typeof profissionais)[0] | undefined;

  if (ctx.payloadType === "barber") {
    prof = profissionais.find((p) => p.id === ctx.payloadValue);
  } else {
    const num = parseInt(ctx.mensagemEntrada.trim());
    const idx = num - 1;
    // última opção da lista numerada é sempre "↩ Início"
    const profOpcoes = await buildProfissionais(ctx.tenantId);
    if (num === profOpcoes.length + 1) {
      return handleInicio({ ...ctx, etapa: "INICIO" });
    }
    if (!isNaN(idx) && idx >= 0 && idx < profissionais.length) prof = profissionais[idx];
  }

  if (!prof) {
    const profOpcoes = await buildProfissionais(ctx.tenantId);
    return {
      resposta: "Opção inválida. Escolha o profissional:",
      opcoes: [...profOpcoes, { label: "↩ Início", payload: "nav:back" }],
      proximaEtapa: "PROFISSIONAL",
      dadosAtualizados: ctx.dados,
    };
  }

  const texto = await getTexto(
    ctx.tenantId, "ESCOLHA_DATA",
    `Perfeito! *${prof.nome}* selecionado.\n\nQual data você prefere?`,
    { barberName: prof.nome }
  );
  return {
    resposta: texto,
    opcoes: await buildOpcoesData(ctx.tenantId),
    proximaEtapa: "DATA",
    dadosAtualizados: { ...ctx.dados, profissional_id: prof.id, profissional_nome: prof.nome },
  };
}

async function handleData(ctx: ContextoSessao): Promise<ResultadoEstado> {
  // ← Voltar → escolher profissional novamente
  if (ctx.payloadType === "nav" && ctx.payloadValue === "back") {
    const profOpcoes = await buildProfissionais(ctx.tenantId);
    const texto = await getTexto(
      ctx.tenantId, "ESCOLHA_PROFISSIONAL",
      `Você escolheu *${ctx.dados.servico_nome}*.\n\nEscolha o profissional:`,
      { serviceName: ctx.dados.servico_nome ?? "" }
    );
    return {
      resposta: texto,
      opcoes: [...profOpcoes, { label: "↩ Início", payload: "nav:back" }],
      proximaEtapa: "PROFISSIONAL",
      dadosAtualizados: { ...ctx.dados, profissional_id: undefined, profissional_nome: undefined },
    };
  }

  let dataISO: string | null = null;

  if (ctx.payloadType === "date") {
    if (ctx.payloadValue === "custom") {
      return {
        resposta: "Por favor, informe a data no formato DD/MM/AAAA (ex: 25/07/2025).\n\nOu digite *cancelar* para recomeçar.",
        proximaEtapa: "DATA",
        dadosAtualizados: ctx.dados,
      };
    }
    dataISO = ctx.payloadValue ?? null;
  } else {
    const num = parseInt(ctx.mensagemEntrada.trim());
    // opções numeradas: 1=Hoje 2=Amanhã 3=Outra data 4=↩ Voltar
    if (num === 1) { dataISO = isoHoje(); }
    else if (num === 2) { dataISO = isoAmanha(); }
    else if (num === 3) {
      return {
        resposta: "Por favor, informe a data no formato DD/MM/AAAA (ex: 25/07/2025).\n\nOu digite *cancelar* para recomeçar.",
        proximaEtapa: "DATA",
        dadosAtualizados: ctx.dados,
      };
    } else if (num === 4) {
      // ↩ Voltar → profissional
      const profOpcoes = await buildProfissionais(ctx.tenantId);
      const texto = await getTexto(
        ctx.tenantId, "ESCOLHA_PROFISSIONAL",
        `Você escolheu *${ctx.dados.servico_nome}*.\n\nEscolha o profissional:`,
        { serviceName: ctx.dados.servico_nome ?? "" }
      );
      return {
        resposta: texto,
        opcoes: [...profOpcoes, { label: "↩ Início", payload: "nav:back" }],
        proximaEtapa: "PROFISSIONAL",
        dadosAtualizados: { ...ctx.dados, profissional_id: undefined, profissional_nome: undefined },
      };
    } else {
      const match = ctx.mensagemEntrada.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        const [, dia, mes, ano] = match;
        dataISO = `${ano}-${mes}-${dia}`;
      }
    }
  }

  if (!dataISO) {
    return {
      resposta: "Formato de data inválido. Use DD/MM/AAAA ou escolha uma opção:",
      opcoes: await buildOpcoesData(ctx.tenantId),
      proximaEtapa: "DATA",
      dadosAtualizados: ctx.dados,
    };
  }

  if (new Date(`${dataISO}T00:00:00`) < new Date(new Date().toDateString())) {
    return {
      resposta: "Essa data já passou. Por favor, informe uma data futura.",
      opcoes: await buildOpcoesData(ctx.tenantId),
      proximaEtapa: "DATA",
      dadosAtualizados: ctx.dados,
    };
  }

  const horariosOpcoes = await buildHorarios(ctx.tenantId, ctx.dados.profissional_id!, dataISO);
  const dataFormatada = formatarData(dataISO);

  if (!horariosOpcoes) {
    const [labelSim, labelNao] = await getLabels(
      ctx.tenantId, "FILA_ESPERA_PROMPT", ["Sim, entrar na fila", "Não, escolher outra data"]
    );
    const textoFila = await getTexto(
      ctx.tenantId, "FILA_ESPERA_PROMPT",
      MSG_FILA_ESPERA_OFERTA(dataFormatada, ctx.dados.profissional_nome ?? ""),
      { date: dataFormatada, barberName: ctx.dados.profissional_nome ?? "" }
    );
    return {
      resposta: textoFila,
      opcoes: [
        { label: labelSim, payload: "waitlist:yes" },
        { label: labelNao, payload: "waitlist:no" },
      ],
      proximaEtapa: "FILA_ESPERA",
      dadosAtualizados: { ...ctx.dados, data: dataISO },
    };
  }

  const textoHorario = await getTexto(
    ctx.tenantId, "ESCOLHA_HORARIO",
    `Horários disponíveis em *${dataFormatada}*:`,
    { date: dataFormatada }
  );
  return {
    resposta: textoHorario,
    opcoes: horariosOpcoes,
    proximaEtapa: "HORARIO",
    dadosAtualizados: { ...ctx.dados, data: dataISO },
  };
}

async function handleHorario(ctx: ContextoSessao): Promise<ResultadoEstado> {
  // ← Voltar → escolher data novamente
  if (ctx.payloadType === "nav" && ctx.payloadValue === "back") {
    const texto = await getTexto(
      ctx.tenantId, "ESCOLHA_DATA",
      `Qual data você prefere?`
    );
    return {
      resposta: texto,
      opcoes: await buildOpcoesData(ctx.tenantId),
      proximaEtapa: "DATA",
      dadosAtualizados: { ...ctx.dados, data: undefined, horario: undefined },
    };
  }

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
    const num = parseInt(ctx.mensagemEntrada.trim());
    const slotsExibidos = Math.min(horarios.length, 9);
    // última opção da lista é sempre "↩ Voltar"
    if (num === slotsExibidos + 1) {
      const texto = await getTexto(ctx.tenantId, "ESCOLHA_DATA", "Qual data você prefere?");
      return {
        resposta: texto,
        opcoes: await buildOpcoesData(ctx.tenantId),
        proximaEtapa: "DATA",
        dadosAtualizados: { ...ctx.dados, data: undefined, horario: undefined },
      };
    }
    const idx = num - 1;
    if (!isNaN(idx) && idx >= 0 && idx < slotsExibidos) horario = horarios[idx];
  }

  if (!horario) {
    return {
      resposta: "Opção inválida. Escolha um horário:",
      opcoes: [
        ...horarios.slice(0, 9).map((h) => ({ label: h, payload: `slot:${h}` })),
        { label: "↩ Voltar", payload: "nav:back" },
      ],
      proximaEtapa: "HORARIO",
      dadosAtualizados: ctx.dados,
    };
  }

  const dataFormatada = formatarData(ctx.dados.data!);
  const [labelConfirmar, labelCancelar] = await getLabels(
    ctx.tenantId, "CONFIRMACAO_AGENDAMENTO", ["✅ Confirmar", "❌ Cancelar"]
  );
  const textoPadrao =
    `Confirme seu agendamento:\n\n` +
    `📋 *Serviço:* ${ctx.dados.servico_nome}\n` +
    `👤 *Profissional:* ${ctx.dados.profissional_nome}\n` +
    `📅 *Data:* ${dataFormatada}\n` +
    `🕐 *Horário:* ${horario}`;
  const textoConfirm = await getTexto(
    ctx.tenantId, "CONFIRMACAO_AGENDAMENTO", textoPadrao,
    { serviceName: ctx.dados.servico_nome ?? "", barberName: ctx.dados.profissional_nome ?? "", date: dataFormatada, time: horario }
  );

  return {
    resposta: textoConfirm,
    opcoes: [
      { label: labelConfirmar, payload: "confirm:yes" },
      { label: labelCancelar,  payload: "confirm:no" },
      { label: "↩ Voltar",     payload: "nav:back" },
    ],
    proximaEtapa: "CONFIRMACAO",
    dadosAtualizados: { ...ctx.dados, horario },
  };
}

async function handleConfirmacao(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const input = ctx.mensagemEntrada.trim().toLowerCase();
  const num = parseInt(ctx.mensagemEntrada.trim());

  // opções numeradas: 1=Confirmar 2=Cancelar 3=↩ Voltar
  if (num === 3 || (ctx.payloadType === "nav" && ctx.payloadValue === "back")) {
    const horariosOpcoes = await buildHorarios(
      ctx.tenantId, ctx.dados.profissional_id!, ctx.dados.data!
    );
    const dataFormatada = formatarData(ctx.dados.data!);
    const textoHorario = await getTexto(
      ctx.tenantId, "ESCOLHA_HORARIO",
      `Horários disponíveis em *${dataFormatada}*:`,
      { date: dataFormatada }
    );
    return {
      resposta: textoHorario,
      opcoes: horariosOpcoes ?? [{ label: "↩ Voltar", payload: "nav:back" }],
      proximaEtapa: "HORARIO",
      dadosAtualizados: { ...ctx.dados, horario: undefined },
    };
  }

  const confirmou =
    ctx.payloadType === "confirm"
      ? ctx.payloadValue === "yes"
      : num === 1 || ["sim", "s", "confirmar"].includes(input);

  const cancelou =
    ctx.payloadType === "confirm"
      ? ctx.payloadValue === "no"
      : num === 2 || ["não", "nao", "n", "cancelar"].includes(input);

  if (confirmou) {
    return {
      resposta: "Ótimo! Qual é o seu *nome completo*?\n\n_Ou digite *cancelar* para recomeçar._",
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
      { label: "❌ Cancelar",  payload: "confirm:no" },
      { label: "↩ Voltar",    payload: "nav:back" },
    ],
    proximaEtapa: "CONFIRMACAO",
    dadosAtualizados: ctx.dados,
  };
}

async function handleConfirmar(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const nomeCliente = ctx.mensagemEntrada.trim();

  if (nomeCliente.length < 2) {
    return {
      resposta: "Por favor, informe seu nome completo para confirmar o agendamento.\n\n_Ou digite *cancelar* para recomeçar._",
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
  const num = parseInt(ctx.mensagemEntrada.trim());

  const entrou =
    ctx.payloadType === "waitlist"
      ? ctx.payloadValue === "yes"
      : num === 1 || ["sim", "s"].includes(input);

  const recusou =
    ctx.payloadType === "waitlist"
      ? ctx.payloadValue === "no"
      : num === 2 || ["não", "nao", "n"].includes(input);

  if (entrou) {
    return {
      resposta: MSG_FILA_ESPERA_PEDIR_NOME,
      proximaEtapa: "FILA_NOME",
      dadosAtualizados: ctx.dados,
    };
  }

  if (recusou) {
    // "Não" → voltar para escolher outra data
    const texto = await getTexto(
      ctx.tenantId, "ESCOLHA_DATA",
      `Qual outra data você prefere?`
    );
    return {
      resposta: texto,
      opcoes: await buildOpcoesData(ctx.tenantId),
      proximaEtapa: "DATA",
      dadosAtualizados: { ...ctx.dados, data: undefined },
    };
  }

  return {
    resposta: MSG_FILA_ESPERA_NAO_ENTENDIDO,
    opcoes: [
      { label: "Sim, entrar na fila",       payload: "waitlist:yes" },
      { label: "Não, escolher outra data",  payload: "waitlist:no" },
    ],
    proximaEtapa: "FILA_ESPERA",
    dadosAtualizados: ctx.dados,
  };
}

async function handleFilaNome(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const nomeCliente = ctx.mensagemEntrada.trim();

  if (nomeCliente.length < 2) {
    return {
      resposta: "Por favor, informe seu nome completo.\n\n_Ou digite *cancelar* para recomeçar._",
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

const CANCEL_KEYWORDS = new Set([
  "cancelar", "cancel", "sair", "reiniciar", "recomeçar",
  "recomecar", "menu", "inicio", "início", "0", "voltar",
]);

const handlers: Record<Etapa, (ctx: ContextoSessao) => Promise<ResultadoEstado>> = {
  INICIO:       handleInicio,
  SERVICO:      handleServico,
  PROFISSIONAL: handleProfissional,
  DATA:         handleData,
  HORARIO:      handleHorario,
  CONFIRMACAO:  handleConfirmacao,
  CONFIRMAR:    handleConfirmar,
  FILA_ESPERA:  handleFilaEspera,
  FILA_NOME:    handleFilaNome,
  CONCLUIDO:    handleInicio,
};

export async function processarMensagem(ctx: ContextoSessao): Promise<ResultadoEstado> {
  // Intercepta palavras globais de cancelamento/reinício em qualquer etapa
  if (CANCEL_KEYWORDS.has(ctx.mensagemEntrada.trim().toLowerCase())) {
    return handleInicio({ ...ctx, etapa: "INICIO" });
  }

  const etapaEfetiva: Etapa = ctx.etapa === "CONCLUIDO" ? "INICIO" : ctx.etapa;
  return handlers[etapaEfetiva]({ ...ctx, etapa: etapaEfetiva });
}

export type { DadosColetados };
