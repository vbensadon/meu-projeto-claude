import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import platformApi from "../../lib/platformApi";

type IntegrationStatus = "PENDING" | "CONNECTED" | "EXPIRED" | "ERROR";
type TenantStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "CANCELLED";

interface TenantDetail {
  id: string; nome: string; slug: string; status: TenantStatus;
  whatsappStatus: IntegrationStatus; calendarStatus: IntegrationStatus;
  plano: string; created_at: string; provisionedAt: string | null;
  twilioNumber: string | null; telefone_whatsapp: string;
  usuarios: { id: string; nome: string; email: string }[];
  subscriptions: { status: string; trialEndsAt: string | null; plan: { name: string; priceMonthly: number; maxBarbers: number; maxMessages: number } }[];
  _count: { agendamentos: number; clientes: number; profissionais: number; campanhas: number };
}

interface ProvLog { step: string; status: string; error: string | null; createdAt: string }

interface UsageMetric { date: string; messagesProcessed: number; appointmentsCreated: number; webhookErrors: number }

const STATUS_COLORS: Record<TenantStatus, string> = {
  PROVISIONING: "bg-yellow-900/40 text-yellow-400",
  ACTIVE: "bg-green-900/40 text-green-400",
  SUSPENDED: "bg-red-900/40 text-red-400",
  CANCELLED: "bg-gray-800 text-gray-500",
};

const INTEGRATION_COLORS: Record<IntegrationStatus, string> = {
  PENDING: "text-yellow-400",
  CONNECTED: "text-green-400",
  EXPIRED: "text-orange-400",
  ERROR: "text-red-400",
};

function MetricCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <div className="text-gray-500 text-xs mb-1">{label}</div>
      <div className="text-white font-bold text-xl">{value}</div>
      {sub && <div className="text-gray-600 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

export default function PlatformTenantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<{ tenant: TenantDetail; ultimaAtividade: string | null; provisioningLogs: ProvLog[]; features: Record<string, boolean>; metrics: UsageMetric[] } | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [detail, healthRes] = await Promise.all([
        platformApi.get(`/tenants/${id}`),
        platformApi.get(`/tenants/${id}/health`),
      ]);
      setData(detail.data);
      setHealth(healthRes.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function doAction(action: string, payload?: any) {
    setActionLoading(action);
    try {
      await platformApi.post(`/tenants/${id}/${action}`, payload ?? {});
      await load();
    } catch (err: any) {
      alert(err.response?.data?.erro ?? "Erro ao executar ação.");
    } finally {
      setActionLoading("");
    }
  }

  async function impersonate() {
    try {
      const { data } = await platformApi.post(`/tenants/${id}/impersonate`);
      // Abre o painel do tenant em nova aba com o token de impersonation
      const url = `${window.location.origin}/agenda?impersonation_token=${data.token}`;
      window.open(url, "_blank");
    } catch (err: any) {
      alert(err.response?.data?.erro ?? "Erro ao iniciar impersonation.");
    }
  }

  async function exportData() {
    try {
      const response = await platformApi.get(`/tenants/${id}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tenant-${data?.tenant.slug}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erro ao exportar dados.");
    }
  }

  async function deleteTenant() {
    try {
      await platformApi.delete(`/tenants/${id}?confirm=true`);
      navigate("/platform/tenants");
    } catch (err: any) {
      alert(err.response?.data?.erro ?? "Erro ao excluir.");
    }
  }

  if (loading) return <div className="p-8 text-gray-600">Carregando...</div>;
  if (!data) return <div className="p-8 text-red-400">Tenant não encontrado.</div>;

  const { tenant, ultimaAtividade, provisioningLogs, metrics } = data;
  const totalMessages = metrics.reduce((a, m) => a + m.messagesProcessed, 0);
  const totalAppointments = metrics.reduce((a, m) => a + m.appointmentsCreated, 0);
  const plan = tenant.subscriptions[0]?.plan;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/platform/tenants")} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">{tenant.nome}</h1>
            <span className="text-gray-500 text-sm">{tenant.slug}</span>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[tenant.status]}`}>
            {tenant.status}
          </span>
        </div>

        {/* Ações principais */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={impersonate} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors">
            Entrar como dono
          </button>
          <Link to={`/platform/tenants/${id}/conversations`} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors">
            Conversas
          </Link>
          <Link to={`/platform/tenants/${id}/features`} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors">
            Feature flags
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Info do tenant */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Informações</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Dono</span><div className="text-white mt-0.5">{tenant.usuarios[0]?.nome}</div><div className="text-gray-500 text-xs">{tenant.usuarios[0]?.email}</div></div>
            <div><span className="text-gray-500">Plano</span><div className="text-white mt-0.5">{plan?.name ?? tenant.plano}</div></div>
            <div><span className="text-gray-500">Assinatura</span><div className="mt-0.5"><span className={`text-xs px-2 py-0.5 rounded-full ${tenant.subscriptions[0]?.status === "ACTIVE" ? "bg-green-900/40 text-green-400" : tenant.subscriptions[0]?.status === "TRIAL" ? "bg-blue-900/40 text-blue-400" : "bg-red-900/40 text-red-400"}`}>{tenant.subscriptions[0]?.status ?? "—"}</span></div></div>
            <div><span className="text-gray-500">Criado em</span><div className="text-white mt-0.5">{new Date(tenant.created_at).toLocaleDateString("pt-BR")}</div></div>
            <div>
              <span className="text-gray-500">WhatsApp</span>
              <div className={`mt-0.5 text-sm font-medium ${INTEGRATION_COLORS[tenant.whatsappStatus]}`}>{tenant.whatsappStatus}</div>
              <div className="text-gray-600 text-xs">{tenant.twilioNumber ?? tenant.telefone_whatsapp}</div>
            </div>
            <div>
              <span className="text-gray-500">Google Calendar</span>
              <div className={`mt-0.5 text-sm font-medium ${INTEGRATION_COLORS[tenant.calendarStatus]}`}>{tenant.calendarStatus}</div>
              {health?.calendar?.tokenExpired && <div className="text-orange-400 text-xs">Token expirado</div>}
            </div>
          </div>
        </div>

        {/* Métricas (30 dias) */}
        <div className="space-y-3">
          <MetricCard label="Msgs (30 dias)" value={totalMessages} sub={plan ? `de ${plan.maxMessages.toLocaleString()} no plano` : undefined} />
          <MetricCard label="Agendamentos (30 dias)" value={totalAppointments} />
          <MetricCard label="Barbeiros" value={tenant._count.profissionais} sub={plan ? `de ${plan.maxBarbers} no plano` : undefined} />
          <MetricCard label="Última atividade" value={ultimaAtividade ? new Date(ultimaAtividade).toLocaleDateString("pt-BR") : "—"} />
        </div>
      </div>

      {/* Provisionamento */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-white mb-4">Status do provisionamento</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {provisioningLogs.map((log) => (
            <div key={log.step} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${log.status === "success" ? "bg-green-900/20 text-green-400" : log.status === "failed" ? "bg-red-900/20 text-red-400" : "bg-yellow-900/20 text-yellow-400"}`}>
              <span className="capitalize">{log.step.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => doAction("resend-onboarding")}
          disabled={actionLoading === "resend-onboarding"}
          className="mt-4 text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          {actionLoading === "resend-onboarding" ? "Reenviando..." : "Reenviar instruções ao dono"}
        </button>
      </div>

      {/* Ações de lifecycle */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Ações</h2>
        <div className="flex flex-wrap gap-3">
          {tenant.status === "ACTIVE" && (
            <button
              onClick={() => { const motivo = prompt("Motivo da suspensão:"); if (motivo !== null) doAction("suspend", { motivo }); }}
              disabled={!!actionLoading}
              className="text-sm bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400 border border-yellow-800/50 px-4 py-2 rounded-lg transition-colors"
            >
              Suspender
            </button>
          )}
          {tenant.status === "SUSPENDED" && (
            <button
              onClick={() => doAction("reactivate")}
              disabled={!!actionLoading}
              className="text-sm bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-800/50 px-4 py-2 rounded-lg transition-colors"
            >
              Reativar
            </button>
          )}
          {tenant.status !== "CANCELLED" && (
            <button
              onClick={() => { if (confirm("Cancelar esta barbearia?")) doAction("cancel"); }}
              disabled={!!actionLoading}
              className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-400 px-4 py-2 rounded-lg transition-colors"
            >
              Cancelar assinatura
            </button>
          )}
          <button
            onClick={exportData}
            className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-400 px-4 py-2 rounded-lg transition-colors"
          >
            Exportar dados (LGPD)
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800/50 px-4 py-2 rounded-lg transition-colors"
            >
              Excluir tenant
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-xs">Confirmar exclusão irreversível?</span>
              <button onClick={deleteTenant} className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors">Sim, excluir</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs bg-gray-800 text-gray-400 px-3 py-1.5 rounded-lg">Cancelar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
