import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import type {
  Agendamento,
  DashboardData,
  DashboardResumo,
  PeriodoDashboard,
  Profissional,
  TopItem,
} from "../lib/types";

const CORES_CHIP = [
  "bg-ab-accent border-ab-accent text-white",
  "bg-emerald-500 border-emerald-500 text-white",
  "bg-amber-500 border-amber-500 text-white",
  "bg-rose-500 border-rose-500 text-white",
  "bg-purple-500 border-purple-500 text-white",
];

const STATUS_BADGE: Record<string, string> = {
  confirmado: "bg-ab-teal/15 text-ab-teal",
  pendente: "bg-yellow-500/15 text-yellow-400",
  cancelado: "bg-ab-danger/15 text-ab-danger",
  concluido: "bg-ab-teal/15 text-ab-teal",
  nao_compareceu: "bg-ab-danger/15 text-ab-danger",
};

const OPCOES_PERIODO: { valor: PeriodoDashboard; label: string }[] = [
  { valor: "hoje", label: "Hoje" },
  { valor: "semana", label: "Esta semana" },
  { valor: "mes", label: "Este mês" },
  { valor: "personalizado", label: "Personalizado" },
];

function CardIcon({ children, cor }: { children: React.ReactNode; cor: string }) {
  return (
    <div className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${cor}`}>
      {children}
    </div>
  );
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcularVariacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? null : 100;
  return ((atual - anterior) / anterior) * 100;
}

function Variacao({ valor, corPositivaBoa = true }: { valor: number | null; corPositivaBoa?: boolean }) {
  if (valor === null) return null;
  const positivo = valor >= 0;
  const bom = corPositivaBoa ? positivo : !positivo;
  return (
    <span
      className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${
        bom ? "bg-emerald-500/15 text-emerald-400" : "bg-ab-danger/15 text-ab-danger"
      }`}
    >
      {positivo ? "▲" : "▼"} {Math.abs(valor).toFixed(1)}%
    </span>
  );
}

function CardMetrica({
  titulo,
  valor,
  variacao,
  corPositivaBoa,
  icone,
}: {
  titulo: string;
  valor: string | number;
  variacao: number | null;
  corPositivaBoa?: boolean;
  icone: React.ReactNode;
}) {
  return (
    <div className="bg-ab-card border border-ab-border rounded-card p-5 transition-all duration-200 hover:border-ab-accent/30 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ab-muted leading-tight">{titulo}</p>
        {icone}
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl sm:text-3xl font-bold text-ab-text">{valor}</p>
        <Variacao valor={variacao} corPositivaBoa={corPositivaBoa} />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-ab-card border border-ab-border rounded-card p-5 h-[92px] animate-pulse">
      <div className="h-3 w-20 bg-ab-hover rounded mb-3" />
      <div className="h-7 w-24 bg-ab-hover rounded" />
    </div>
  );
}

function GraficoLinhaReceita({ dados }: { dados: DashboardResumo["receitaPorDia"] }) {
  const data = dados.map((d) => ({
    rotulo: new Date(`${d.data}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    receita: d.receita,
  }));

  return (
    <div className="bg-ab-card border border-ab-border rounded-card p-5">
      <h2 className="font-semibold text-ab-text mb-4">Faturamento por dia</h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2D3E" vertical={false} />
          <XAxis dataKey="rotulo" stroke="#8B8FA8" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#8B8FA8" fontSize={11} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1A1D27", border: "1px solid #2A2D3E", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#E8E9F0" }}
            formatter={(valor) => [formatarMoeda(Number(valor)), "Receita"]}
          />
          <Line type="monotone" dataKey="receita" stroke="#6C63FF" strokeWidth={2.5} dot={{ r: 3, fill: "#6C63FF" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TabelaTop({ titulo, itens }: { titulo: string; itens: TopItem[] }) {
  return (
    <div className="bg-ab-card border border-ab-border rounded-card">
      <div className="px-5 py-4 border-b border-ab-border">
        <h2 className="font-semibold text-ab-text">{titulo}</h2>
      </div>
      <div className="px-5">
        {itens.length === 0 ? (
          <p className="py-8 text-center text-ab-muted text-sm">Sem dados no período.</p>
        ) : (
          itens.map((item, i) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-3 border-b border-ab-border/50 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-ab-muted w-5 shrink-0">{i + 1}º</span>
                <p className="text-sm text-ab-text truncate">{item.nome}</p>
              </div>
              <div className="text-right ml-3 shrink-0">
                <p className="text-sm font-medium text-ab-text">{formatarMoeda(item.receita)}</p>
                <p className="text-xs text-ab-muted">
                  {item.quantidade} atendimento{item.quantidade === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LinhaAgendamento({ ag }: { ag: Agendamento }) {
  const dt = new Date(ag.data_hora);
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-ab-border/50 last:border-0 transition-colors duration-150 hover:bg-ab-hover/50 px-5 -mx-5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ab-text truncate">{ag.cliente_nome}</p>
        <p className="text-xs text-ab-muted mt-0.5">{ag.servico.nome} · {ag.profissional.nome}</p>
      </div>
      <div className="text-right ml-4">
        <p className="text-sm text-ab-muted">
          {dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} às{" "}
          {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 font-medium ${STATUS_BADGE[ag.status]}`}>
          {ag.status}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [filtroProf, setFiltroProf] = useState<string | null>(null);

  const [periodo, setPeriodo] = useState<PeriodoDashboard>("mes");
  const hojeISO = new Date().toISOString().slice(0, 10);
  const [dataInicio, setDataInicio] = useState(hojeISO);
  const [dataFim, setDataFim] = useState(hojeISO);
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [carregandoResumo, setCarregandoResumo] = useState(true);

  useEffect(() => {
    api.get<Profissional[]>("/profissionais").then((r) => setProfissionais(r.data));
  }, []);

  useEffect(() => {
    setCarregando(true);
    const query = filtroProf ? `?profissional_id=${filtroProf}` : "";
    api.get<DashboardData>(`/agendamentos/dashboard${query}`)
      .then((r) => setDados(r.data))
      .finally(() => setCarregando(false));
  }, [filtroProf]);

  useEffect(() => {
    if (periodo === "personalizado" && (!dataInicio || !dataFim)) return;
    setCarregandoResumo(true);
    const params = new URLSearchParams({ periodo });
    if (periodo === "personalizado") {
      params.set("data_inicio", dataInicio);
      params.set("data_fim", dataFim);
    }
    api.get<DashboardResumo>(`/dashboard?${params.toString()}`)
      .then((r) => setResumo(r.data))
      .finally(() => setCarregandoResumo(false));
  }, [periodo, dataInicio, dataFim]);

  const corChip = (id: string) => {
    const idx = profissionais.findIndex((p) => p.id === id);
    return CORES_CHIP[(idx < 0 ? 0 : idx) % CORES_CHIP.length];
  };

  const taxaNoShow = resumo && resumo.agendamentos.total > 0
    ? (resumo.agendamentos.naoCompareceram / resumo.agendamentos.total) * 100
    : 0;
  const taxaNoShowAnterior = resumo && resumo.agendamentos.totalPeriodoAnterior > 0
    ? (resumo.agendamentos.naoCompareceramPeriodoAnterior / resumo.agendamentos.totalPeriodoAnterior) * 100
    : 0;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-ab-text mb-4">Dashboard</h1>

      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
        {OPCOES_PERIODO.map((o) => (
          <button
            key={o.valor}
            onClick={() => setPeriodo(o.valor)}
            className={`text-xs px-3 py-1.5 rounded-chip border transition-all duration-200 whitespace-nowrap ${
              periodo === o.valor
                ? "bg-ab-accent border-ab-accent text-white"
                : "border-ab-border text-ab-muted hover:bg-ab-hover hover:text-ab-text"
            }`}
          >
            {o.label}
          </button>
        ))}
        {periodo === "personalizado" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dataInicio}
              max={dataFim}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-ab-bg border border-ab-border rounded-input px-2.5 py-1.5 text-xs text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent"
            />
            <span className="text-ab-muted text-xs">até</span>
            <input
              type="date"
              value={dataFim}
              min={dataInicio}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-ab-bg border border-ab-border rounded-input px-2.5 py-1.5 text-xs text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent"
            />
          </div>
        )}
      </div>

      {carregandoResumo ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : resumo && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <CardMetrica
            titulo="Faturamento"
            valor={formatarMoeda(resumo.receita.total)}
            variacao={calcularVariacao(resumo.receita.total, resumo.receita.periodoAnterior)}
            icone={<CardIcon cor="bg-ab-teal/15"><span className="text-lg">💰</span></CardIcon>}
          />
          <CardMetrica
            titulo="Ticket médio"
            valor={formatarMoeda(resumo.ticketMedio)}
            variacao={calcularVariacao(resumo.ticketMedio, resumo.ticketMedioPeriodoAnterior)}
            icone={<CardIcon cor="bg-ab-accent/15"><span className="text-lg">🎯</span></CardIcon>}
          />
          <CardMetrica
            titulo="Total de agendamentos"
            valor={resumo.agendamentos.total}
            variacao={calcularVariacao(resumo.agendamentos.total, resumo.agendamentos.totalPeriodoAnterior)}
            icone={
              <CardIcon cor="bg-ab-accent/15">
                <svg className="w-5 h-5 text-ab-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </CardIcon>
            }
          />
          <CardMetrica
            titulo="Taxa de no-show"
            valor={`${taxaNoShow.toFixed(1)}%`}
            variacao={calcularVariacao(taxaNoShow, taxaNoShowAnterior)}
            corPositivaBoa={false}
            icone={<CardIcon cor="bg-ab-danger/15"><span className="text-lg">🚫</span></CardIcon>}
          />
        </div>
      )}

      {dados && (
        <div className="bg-ab-card border border-ab-border rounded-card p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-ab-text font-medium">Projeção da semana</p>
            <p className="text-xs text-ab-muted">confirmados nos próximos 7 dias</p>
          </div>
          <p className="text-lg font-bold text-ab-teal">{formatarMoeda(dados.receitaProjetadaSemana)}</p>
        </div>
      )}

      {resumo && (
        <>
          <div className="mb-6">
            <GraficoLinhaReceita dados={resumo.receitaPorDia} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <TabelaTop titulo="Top serviços" itens={resumo.topServicos} />
            <TabelaTop titulo="Top barbeiros" itens={resumo.topProfissionais} />
          </div>

          {resumo.melhorAvaliado && (
            <div className="bg-ab-card border border-ab-border rounded-card p-4 mb-8 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-400 flex items-center justify-center text-white text-xl shrink-0">
                ★
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ab-muted">Melhor avaliado do mês</p>
                <p className="font-semibold text-ab-text truncate">{resumo.melhorAvaliado.nome}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-bold text-yellow-400">{resumo.melhorAvaliado.media.toFixed(1)}</p>
                <p className="text-xs text-ab-muted">{resumo.melhorAvaliado.total} avaliação{resumo.melhorAvaliado.total !== 1 ? "ões" : ""}</p>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => setFiltroProf(null)}
          className={`text-xs px-3 py-1.5 rounded-chip border transition-all duration-200 whitespace-nowrap ${
            filtroProf === null
              ? "bg-ab-accent border-ab-accent text-white"
              : "border-ab-border text-ab-muted hover:bg-ab-hover hover:text-ab-text"
          }`}
        >
          Todos os barbeiros
        </button>
        {profissionais.filter((p) => p.ativo).map((p) => {
          const ativo = filtroProf === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setFiltroProf(p.id)}
              className={`text-xs px-3 py-1.5 rounded-chip border transition-all duration-200 whitespace-nowrap ${
                ativo ? corChip(p.id) : "border-ab-border text-ab-muted hover:bg-ab-hover hover:text-ab-text"
              }`}
            >
              {p.nome}
            </button>
          );
        })}
      </div>

      {carregando ? (
        <div className="p-8 text-center text-ab-muted">Carregando...</div>
      ) : (
        <div className="bg-ab-card border border-ab-border rounded-card">
          <div className="px-5 py-4 border-b border-ab-border">
            <h2 className="font-semibold text-ab-text">Próximos 7 dias</h2>
          </div>
          <div className="px-5">
            {dados?.proximos.length === 0 ? (
              <p className="py-8 text-center text-ab-muted text-sm">Nenhum agendamento nos próximos 7 dias.</p>
            ) : (
              dados?.proximos.map((ag) => <LinhaAgendamento key={ag.id} ag={ag} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
