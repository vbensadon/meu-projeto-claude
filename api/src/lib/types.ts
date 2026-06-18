export type Etapa =
  | "INICIO"
  | "SERVICO"
  | "PROFISSIONAL"
  | "DATA"
  | "HORARIO"
  | "CONFIRMACAO"   // resumo + botões Confirmar/Cancelar
  | "CONFIRMAR"     // coleta o nome para finalizar o agendamento
  | "FILA_ESPERA"
  | "FILA_NOME"
  | "CONCLUIDO";

export interface DadosColetados {
  servico_id?: string;
  servico_nome?: string;
  profissional_id?: string;
  profissional_nome?: string;
  data?: string; // YYYY-MM-DD
  horario?: string; // HH:MM
  cliente_nome?: string;
}

export interface ContextoSessao {
  tenantId: string;
  clienteTelefone: string;
  etapa: Etapa;
  dados: DadosColetados;
  mensagemEntrada: string;
  // Preenchido quando o input veio de um clique em botão/lista interativa
  payloadType?: string;
  payloadValue?: string;
}

export interface ResultadoEstado {
  resposta: string;
  opcoes?: import("../whatsapp/interactiveMessenger").InteractiveOption[];
  proximaEtapa: Etapa;
  dadosAtualizados: DadosColetados;
  concluido?: boolean;
}

// Tipos de resposta da API REST
export interface AgendamentoComRelacoes {
  id: string;
  cliente_nome: string;
  cliente_telefone: string;
  data_hora: string;
  status: "pendente" | "confirmado" | "cancelado";
  profissional: { id: string; nome: string };
  servico: { id: string; nome: string; duracao_minutos: number; preco: string };
}
