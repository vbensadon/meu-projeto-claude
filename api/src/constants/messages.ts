export const MSG_FILA_ESPERA_OFERTA = (diaMesAno: string, profissionalNome: string): string =>
  `Não há horários disponíveis em ${diaMesAno} com ${profissionalNome}.\n\n` +
  `Deseja entrar na fila de espera para essa data? Avisamos por aqui assim que abrir um horário. Responda *SIM* ou *NÃO*.`;

export const MSG_FILA_ESPERA_NAO_ENTENDIDO =
  "Não entendi sua resposta. Deseja entrar na fila de espera para essa data? Responda *SIM* ou *NÃO*.";

export const MSG_FILA_ESPERA_RECUSADA =
  "Sem problemas! Informe outra data que você prefere (ex: 15/06/2025).";

export const MSG_FILA_ESPERA_PEDIR_NOME =
  "Ótimo! Qual é o seu *nome completo* para colocarmos na fila de espera?";

export const MSG_FILA_ESPERA_CONFIRMACAO = (nomeCliente: string, diaMesAno: string): string =>
  `✅ Pronto, *${nomeCliente}*! Você está na fila de espera para *${diaMesAno}*.\n\n` +
  `Avisaremos por aqui assim que um horário abrir. 😊`;

export const MSG_FILA_ESPERA_VAGA_DISPONIVEL = (
  clienteNome: string,
  diaMesAno: string,
  profissionalNome: string,
  servicoNome: string
): string =>
  `🎉 Boa notícia, ${clienteNome}!\n\n` +
  `Abriu um horário disponível em *${diaMesAno}* com *${profissionalNome}* para *${servicoNome}*.\n\n` +
  `Responda esta mensagem para iniciar um novo agendamento e garantir esse horário.`;

export const MSG_LEMBRETE_PADRAO =
  `Olá, {clientName}! 👋\n` +
  `Lembrando do seu agendamento amanhã:\n` +
  `📅 {date} às {time}\n` +
  `✂️ {serviceName} com {barberName}\n\n` +
  `Responda *CONFIRMAR* para confirmar ou *CANCELAR* para cancelar.`;

export const MSG_LEMBRETE_CONFIRMADO =
  "✅ Combinado! Seu agendamento está confirmado. Até breve!";

export const MSG_LEMBRETE_CANCELADO =
  "Seu agendamento foi cancelado. Se quiser remarcar, é só mandar uma mensagem por aqui. 😊";
