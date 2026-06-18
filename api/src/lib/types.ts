export type Etapa =
  | "INICIO"
  | "SERVICO"
  | "PROFISSIONAL"
  | "DATA"
  | "HORARIO"
  | "CONFIRMAR"
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
}

export interface ResultadoEstado {
  resposta: string;
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
