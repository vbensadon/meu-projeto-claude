import { prisma } from "../lib/prisma";
import type { ContextoSessao, DadosColetados, Etapa, ResultadoEstado } from "../lib/types";
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

// ── handlers por etapa ─────────────────────────────────────────────────────

async function handleInicio(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const servicos = await prisma.servico.findMany({
    where: { tenant_id: ctx.tenantId },
    orderBy: { nome: "asc" },
  });

  if (servicos.length === 0) {
    return {
      resposta: "Olá! No momento não temos serviços disponíveis. Tente mais tarde.",
      proximaEtapa: "INICIO",
      dadosAtualizados: {},
    };
  }

  const lista = servicos
    .map((s, i) => `${i + 1}. ${s.nome} — ${s.duracao_minutos}min — R$${s.preco}`)
    .join("\n");

  return {
    resposta: `Olá! Bem-vindo ao agendamento 😊\n\nEscolha o serviço:\n\n${lista}\n\nDigite o número da opção.`,
    proximaEtapa: "SERVICO",
    dadosAtualizados: {},
  };
}

async function handleServico(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const servicos = await prisma.servico.findMany({
    where: { tenant_id: ctx.tenantId },
    orderBy: { nome: "asc" },
  });

  const idx = parseInt(ctx.mensagemEntrada.trim()) - 1;

  if (isNaN(idx) || idx < 0 || idx >= servicos.length) {
    const lista = servicos.map((s, i) => `${i + 1}. ${s.nome}`).join("\n");
    return {
      resposta: `Opção inválida. Por favor, escolha um número da lista:\n\n${lista}`,
      proximaEtapa: "SERVICO",
      dadosAtualizados: ctx.dados,
    };
  }

  const servico = servicos[idx];
  const profissionais = await prisma.profissional.findMany({
    where: { tenant_id: ctx.tenantId, ativo: true },
    orderBy: { nome: "asc" },
  });

  const lista = profissionais.map((p, i) => `${i + 1}. ${p.nome}`).join("\n");

  return {
    resposta: `Ótimo! Você escolheu *${servico.nome}*.\n\nAgora, escolha o profissional:\n\n${lista}\n\nDigite o número da opção.`,
    proximaEtapa: "PROFISSIONAL",
    dadosAtualizados: { ...ctx.dados, servico_id: servico.id, servico_nome: servico.nome },
  };
}

async function handleProfissional(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const profissionais = await prisma.profissional.findMany({
    where: { tenant_id: ctx.tenantId, ativo: true },
    orderBy: { nome: "asc" },
  });

  const idx = parseInt(ctx.mensagemEntrada.trim()) - 1;

  if (isNaN(idx) || idx < 0 || idx >= profissionais.length) {
    const lista = profissionais.map((p, i) => `${i + 1}. ${p.nome}`).join("\n");
    return {
      resposta: `Opção inválida. Escolha:\n\n${lista}`,
      proximaEtapa: "PROFISSIONAL",
      dadosAtualizados: ctx.dados,
    };
  }

  const prof = profissionais[idx];

  return {
    resposta: `Perfeito! *${prof.nome}* selecionado.\n\nQual data você prefere? (ex: 15/06/2025)`,
    proximaEtapa: "DATA",
    dadosAtualizados: { ...ctx.dados, profissional_id: prof.id, profissional_nome: prof.nome },
  };
}

async function handleData(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const match = ctx.mensagemEntrada.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    return {
      resposta: "Formato de data inválido. Use DD/MM/AAAA (ex: 15/06/2025).",
      proximaEtapa: "DATA",
      dadosAtualizados: ctx.dados,
    };
  }

  const [, dia, mes, ano] = match;
  const dataISO = `${ano}-${mes}-${dia}`;
  const dataObj = new Date(`${dataISO}T00:00:00`);

  if (dataObj < new Date(new Date().toDateString())) {
    return {
      resposta: "Essa data já passou. Por favor, informe uma data futura.",
      proximaEtapa: "DATA",
      dadosAtualizados: ctx.dados,
    };
  }

  const horarios = await buscarHorariosDisponiveis(
    ctx.tenantId,
    ctx.dados.profissional_id!,
    dataISO
  );

  if (horarios.length === 0) {
    return {
      resposta: MSG_FILA_ESPERA_OFERTA(`${dia}/${mes}/${ano}`, ctx.dados.profissional_nome ?? ""),
      proximaEtapa: "FILA_ESPERA",
      dadosAtualizados: { ...ctx.dados, data: dataISO },
    };
  }

  const lista = horarios.map((h, i) => `${i + 1}. ${h}`).join("\n");

  return {
    resposta: `Horários disponíveis em *${dia}/${mes}/${ano}*:\n\n${lista}\n\nDigite o número do horário.`,
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

  const idx = parseInt(ctx.mensagemEntrada.trim()) - 1;

  if (isNaN(idx) || idx < 0 || idx >= horarios.length) {
    const lista = horarios.map((h, i) => `${i + 1}. ${h}`).join("\n");
    return {
      resposta: `Opção inválida. Escolha:\n\n${lista}`,
      proximaEtapa: "HORARIO",
      dadosAtualizados: ctx.dados,
    };
  }

  const horario = horarios[idx];
  const [d, m, y] = ctx.dados.data!.split("-").reverse().join("/").split("/");
  const dataFormatada = `${d}/${m}/${y}`;

  return {
    resposta:
      `Por favor, confirme seu agendamento:\n\n` +
      `📋 *Serviço:* ${ctx.dados.servico_nome}\n` +
      `👤 *Profissional:* ${ctx.dados.profissional_nome}\n` +
      `📅 *Data:* ${dataFormatada}\n` +
      `🕐 *Horário:* ${horario}\n\n` +
      `Qual é o seu *nome completo*?`,
    proximaEtapa: "CONFIRMAR",
    dadosAtualizados: { ...ctx.dados, horario },
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

  const [ano, mes, dia] = ctx.dados.data!.split("-");

  return {
    resposta:
      `✅ *Agendamento confirmado!*\n\n` +
      `Obrigado, *${nomeCliente}*!\n\n` +
      `📋 ${ctx.dados.servico_nome}\n` +
      `👤 ${ctx.dados.profissional_nome}\n` +
      `📅 ${dia}/${mes}/${ano} às ${ctx.dados.horario}\n\n` +
      `Até lá! 😊`,
    proximaEtapa: "CONCLUIDO",
    dadosAtualizados: dados,
    concluido: true,
  };
}

async function handleFilaEspera(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const resposta = ctx.mensagemEntrada.trim().toLowerCase();

  if (resposta === "sim" || resposta === "s") {
    return {
      resposta: MSG_FILA_ESPERA_PEDIR_NOME,
      proximaEtapa: "FILA_NOME",
      dadosAtualizados: ctx.dados,
    };
  }

  if (resposta === "não" || resposta === "nao" || resposta === "n") {
    return {
      resposta: MSG_FILA_ESPERA_RECUSADA,
      proximaEtapa: "DATA",
      dadosAtualizados: ctx.dados,
    };
  }

  return {
    resposta: MSG_FILA_ESPERA_NAO_ENTENDIDO,
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

  const [ano, mes, dia] = ctx.dados.data!.split("-");

  return {
    resposta: MSG_FILA_ESPERA_CONFIRMACAO(nomeCliente, `${dia}/${mes}/${ano}`),
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
  CONFIRMAR: handleConfirmar,
  FILA_ESPERA: handleFilaEspera,
  FILA_NOME: handleFilaNome,
  CONCLUIDO: handleInicio, // reinicia o fluxo
};

export async function processarMensagem(ctx: ContextoSessao): Promise<ResultadoEstado> {
  const etapaEfetiva: Etapa = ctx.etapa === "CONCLUIDO" ? "INICIO" : ctx.etapa;
  const handler = handlers[etapaEfetiva];
  return handler({ ...ctx, etapa: etapaEfetiva });
}

export type { DadosColetados };
