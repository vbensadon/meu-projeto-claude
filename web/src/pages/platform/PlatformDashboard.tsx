import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import platformApi from "../../lib/platformApi";

interface DashboardData {
  tenants: { byStatus: Record<string, number>; total: number; newThisMonth: number };
  mrr: number;
  messages: { today: number; thisMonth: number };
  appointments: { today: number; thisMonth: number };
  webhookErrors: { today: number };
  tenantsWithIssues: { id: string; nome: string; slug: string; status: string; whatsappStatus: string; calendarStatus: string }[];
}

interface AlertCounts { total: number; CRITICAL: number; WARNING: number; INFO: number }

function Stat({ label, value, sub, color = "text-white" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-gray-500 text-xs mb-2">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-gray-600 text-xs mt-1">{sub}</div>}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativos",
  TRIAL: "Trial",
  PROVISIONING: "Provisionando",
  SUSPENDED: "Suspensos",
  CANCELLED: "Cancelados",
};

export default function PlatformDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [alertCounts, setAlertCounts] = useState<AlertCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      platformApi.get("/dashboard"),
      platformApi.get("/alerts/counts"),
    ]).then(([dash, alerts]) => {
      setData(dash.data);
      setAlertCounts(alerts.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-600">Carregando...</div>;
  if (!data) return <div className="p-8 text-red-400">Erro ao carregar dashboard.</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Dashboard da Plataforma</h1>
        <p className="text-gray-500 text-sm mt-0.5">Visão geral em tempo real</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label="Total de barbearias" value={data.tenants.total} sub={`+${data.tenants.newThisMonth} este mês`} />
        <Stat label="MRR estimado" value={`R$${data.mrr.toLocaleString("pt-BR")}`} color="text-green-400" />
        <Stat label="Mensagens hoje" value={data.messages.today} sub={`${data.messages.thisMonth.toLocaleString()} este mês`} />
        <Stat
          label="Erros webhook hoje"
          value={data.webhookErrors.today}
          color={data.webhookErrors.today > 0 ? "text-red-400" : "text-white"}
        />
      </div>

      {/* Card de alertas */}
      {alertCounts && alertCounts.total > 0 && (
        <Link to="/platform/alerts" className="flex items-center justify-between bg-gray-900 border border-red-900/40 rounded-xl p-4 mb-4 hover:border-red-800/60 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-900/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-medium">{alertCounts.total} alerta{alertCounts.total !== 1 ? "s" : ""} em aberto</p>
              <div className="flex gap-3 mt-0.5">
                {alertCounts.CRITICAL > 0 && <span className="text-red-400 text-xs">{alertCounts.CRITICAL} crítico{alertCounts.CRITICAL !== 1 ? "s" : ""}</span>}
                {alertCounts.WARNING > 0 && <span className="text-yellow-400 text-xs">{alertCounts.WARNING} aviso{alertCounts.WARNING !== 1 ? "s" : ""}</span>}
                {alertCounts.INFO > 0 && <span className="text-blue-400 text-xs">{alertCounts.INFO} info</span>}
              </div>
            </div>
          </div>
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Status de tenants */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Tenants por status</h2>
          <div className="space-y-3">
            {Object.entries(data.tenants.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-gray-400 text-sm">{STATUS_LABEL[status] ?? status}</span>
                  <span className="text-white font-medium text-sm">{count}</span>
                </div>
                <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full ${status === "ACTIVE" ? "bg-green-500" : status === "SUSPENDED" ? "bg-yellow-500" : status === "CANCELLED" ? "bg-red-500" : "bg-gray-600"}`}
                    style={{ width: `${(count / data.tenants.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agendamentos */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Agendamentos</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Hoje</span>
              <span className="text-white font-bold text-lg">{data.appointments.today}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Este mês</span>
              <span className="text-white font-bold text-lg">{data.appointments.thisMonth.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {data.tenantsWithIssues.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Requer atenção ({data.tenantsWithIssues.length})
          </h2>
          <div className="space-y-2">
            {data.tenantsWithIssues.map((t) => (
              <Link
                key={t.id}
                to={`/platform/tenants/${t.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors"
              >
                <div>
                  <span className="text-white text-sm">{t.nome}</span>
                  <span className="text-gray-500 text-xs ml-2">{t.slug}</span>
                </div>
                <div className="flex gap-2 text-xs">
                  {t.status === "SUSPENDED" && <span className="text-yellow-400">suspenso</span>}
                  {t.whatsappStatus === "ERROR" && <span className="text-red-400">wa:erro</span>}
                  {t.calendarStatus === "EXPIRED" && <span className="text-orange-400">cal:expirado</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
