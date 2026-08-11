export interface Profissional {
  id: string;
  nome: string;
  telefone_whatsapp: string | null;
  google_calendar_id: string | null;
  ativo: boolean;
  comissao_percentual: string;
}

export interface ComissaoBarbeiro {
  profissional: { id: string; nome: string };
  mes: string;
  atendimentos: number;
  receita: number;
  comissao_percentual: number;
  comissao_valor: number;
  pago: boolean;
  valor_pago: number | null;
  pago_em: string | null;
}

export interface Servico {
  id: string;
  nome: string;
  duracao_minutos: number;
  preco: string;
  ordem: number;
}

export interface AgendamentoServicoItem {
  id: string;
  servico_id: string;
  preco: string;
  ordem: number;
  servico: { id: string; nome: string; duracao_minutos: number; preco: string };
}

export interface Agendamento {
  id: string;
  cliente_nome: string;
  cliente_telefone: string;
  data_hora: string;
  status: "pendente" | "confirmado" | "cancelado" | "concluido" | "nao_compareceu";
  preco?: string | null;
  profissional: { id: string; nome: string };
  // serviço primário (retrocompat) + lista completa de itens
  servico: { id: string; nome: string; duracao_minutos: number; preco: string };
  itens_servico?: AgendamentoServicoItem[];
}

export interface DashboardData {
  totalHoje: number;
  totalMes: number;
  proximos: Agendamento[];
  receitaConfirmadaHoje: number;
  receitaConfirmadaMes: number;
  receitaProjetadaSemana: number;
  agendamentosPorDia: { data: string; total: number; receita: number }[];
}

export type PeriodoDashboard = "hoje" | "semana" | "mes" | "personalizado";

export interface TopItem {
  id: string;
  nome: string;
  quantidade: number;
  receita: number;
}

export interface DashboardResumo {
  receita: { total: number; periodoAnterior: number };
  agendamentos: {
    total: number;
    concluidos: number;
    cancelados: number;
    naoCompareceram: number;
    totalPeriodoAnterior: number;
    naoCompareceramPeriodoAnterior: number;
  };
  ticketMedio: number;
  ticketMedioPeriodoAnterior: number;
  topServicos: TopItem[];
  topProfissionais: TopItem[];
  receitaPorDia: { data: string; receita: number }[];
  melhorAvaliado: { nome: string; media: number; total: number } | null;
}

export interface Bloqueio {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  recorrencia: "diario" | "semanal" | null;
  serie_id: string | null;
  profissional: { id: string; nome: string };
}

export interface ListaEspera {
  id: string;
  cliente_nome: string;
  cliente_telefone: string;
  data_desejada: string;
  status: "aguardando" | "notificado" | "convertido" | "expirado";
  notificado_em: string | null;
  created_at: string;
  profissional: { id: string; nome: string } | null;
  servico: { id: string; nome: string };
}

export interface Tenant {
  id: string;
  nome: string;
  slug: string;
  telefone_whatsapp: string;
  twilio_account_sid: string;
  google_calendar_id_dono: string | null;
  google_calendar_conectado: boolean;
  plano: string;
  lembretes_ativos: boolean;
  mensagem_lembrete: string | null;
}

export interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  notas: string | null;
  preferencias: string | null;
  aniversario: string | null;
  fonte: "whatsapp" | "manual" | "presencial";
  created_at: string;
  totalVisitas: number;
  ultimoAtendimento: string | null;
  badge: "vip" | "regular" | "novo";
}

export interface ClienteDetalhe extends Cliente {
  ticketMedio: number;
  barbeiroFavorito: { nome: string } | null;
}

export interface ClienteAgendamento {
  id: string;
  data_hora: string;
  status: "pendente" | "confirmado" | "cancelado" | "concluido" | "nao_compareceu";
  preco: string | null;
  profissional: { id: string; nome: string };
  servico: { id: string; nome: string; preco: string };
}

export interface AvaliacaoResumo {
  profissional: { id: string; nome: string };
  media: number;
  total: number;
  distribuicao: Record<string, number>;
  comentariosRecentes: {
    nota: number;
    comentario: string;
    cliente: string;
    data: string;
  }[];
}

export interface AvaliarDados {
  profissional: { id: string; nome: string };
  servico: { nome: string };
  data_hora: string;
  jaAvaliado: boolean;
}

export interface ClienteInativo {
  id: string;
  nome: string;
  telefone: string;
  ultimaVisita: string | null;
  diasSemVisita: number | null;
  ultimoServico: string | null;
  ultimoProfissional: string | null;
  totalVisitas: number;
}

export interface LembreteHistorico {
  id: string;
  cliente_nome: string;
  data_hora: string;
  lembrete_enviado_em: string;
  lembrete_status: "entregue" | "falhou";
  profissional: { id: string; nome: string };
  servico: { id: string; nome: string };
}


export type SegmentoCampanha = "todos" | "inativos_30" | "inativos_60" | "aniversariantes_mes" | "vip";
export type StatusCampanha = "rascunho" | "agendada" | "enviando" | "concluida" | "falhou";

export interface Campanha {
  id: string;
  nome: string;
  segmento: SegmentoCampanha;
  mensagem: string;
  agendado_para: string | null;
  enviado_em: string | null;
  status: StatusCampanha;
  total_enviados: number;
  total_falhas: number;
  created_at: string;
  _count: { logs: number };
}

export interface LogCampanha {
  id: string;
  cliente_id: string;
  mensagem: string;
  status: "enviado" | "falhou";
  erro: string | null;
  enviado_em: string;
  cliente: { id: string; nome: string; telefone: string } | null;
}

export type TipoComissao = "percentual" | "fixo";

export interface RegraComissao {
  id: string;
  profissional_id: string;
  servico_id: string | null;
  tipo: TipoComissao;
  valor: string;
  profissional: { id: string; nome: string };
  servico: { id: string; nome: string } | null;
}

export interface LancamentoComissao {
  id: string;
  data: string;
  cliente: string;
  valor_bruto: number;
  comissao_percentual: number;
  comissao_valor: number;
  tipo_regra: string;
  pago: boolean;
  pago_em: string | null;
}

export interface RelatorioComissao {
  profissional: { id: string; nome: string };
  mes: string;
  total_atendimentos: number;
  receita_bruta: number;
  pct_medio: number;
  total_comissao: number;
  total_pago: number;
  total_pendente: number;
  pago: boolean;
  pago_em: string | null;
  lancamentos: LancamentoComissao[];
}

export type RoleUsuario = "dono" | "gerente" | "recepcionista" | "barbeiro";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: RoleUsuario;
  ativo: boolean;
  convite_pendente: boolean;
  created_at: string;
  profissional: { id: string; nome: string } | null;
}

export interface ConfigBot {
  id: string;
  tenant_id: string;
  msg_boas_vindas: string;
  msg_confirmacao: string;
  msg_cancelamento: string;
  msg_fora_horario: string;
  msg_reagendamento: string;
  msg_lista_espera: string;
}

export interface HorarioBot {
  id: string;
  tenant_id: string;
  dia_semana: number;
  ativo: boolean;
  hora_inicio: string;
  hora_fim: string;
}
