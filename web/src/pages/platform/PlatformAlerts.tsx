import { useEffect, useState } from "react";
import platformApi from "../../lib/platformApi";

type Severity = "INFO" | "WARNING" | "CRITICAL";
type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

interface Alert {
  id: string;
  tenantId: string | null;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  status: AlertStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
  tenant: { id: string; nome: string; slug: string } | null;
}

const SEVERITY_STYLES: Record<Severity, string> = {
  CRITICAL: "bg-red-900/40 text-red-400 border-red-800/50",
  WARNING: "bg-yellow-900/40 text-yellow-400 border-yellow-800/50",
  INFO: "bg-blue-900/40 text-blue-400 border-blue-800/50",
};

const STATUS_BADGE: Record<AlertStatus, string> = {
  OPEN: "bg-red-900/30 text-red-400",
  ACKNOWLEDGED: "bg-yellow-900/30 text-yellow-400",
  RESOLVED: "bg-green-900/30 text-green-400",
};

const TYPE_LABEL: Record<string, string> = {
  WEBHOOK_FAILURES: "Falhas de webhook",
  CALENDAR_TOKEN_EXPIRED: "Token Calendar expirado",
  MESSAGE_LIMIT_REACHED: "Limite de mensagens",
  BOT_INACTIVITY: "Inatividade do bot",
  INTEGRATION_ERROR: "Erro de integração",
  PAYMENT_FAILED: "Falha no pagamento",
};

export default function PlatformAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterType, setFilterType] = useState("");

  async function load(p = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (filterStatus) params.set("status", filterStatus);
      if (filterSeverity) params.set("severity", filterSeverity);
      if (filterType) params.set("type", filterType);
      const { data } = await platformApi.get(`/alerts?${params}`);
      setAlerts(data.alerts);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    setPage(1);
  }, [filterStatus, filterSeverity, filterType]);

  async function doAction(id: string, action: "acknowledge" | "resolve") {
    setActionLoading(id + action);
    try {
      await platformApi.patch(`/alerts/${id}/${action}`);
      await load(page);
    } finally {
      setActionLoading("");
    }
  }

  const criticals = alerts.filter((a) => a.severity === "CRITICAL" && a.status !== "RESOLVED");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Central de Alertas</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} alerta{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Críticos em destaque */}
      {criticals.length > 0 && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 mb-6 space-y-2">
          <p className="text-red-400 text-xs font-semibold uppercase tracking-wide mb-3">Críticos em aberto</p>
          {criticals.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-4 bg-red-900/30 rounded-lg p-3">
              <div className="min-w-0 flex-1">
                <p className="text-red-300 text-sm font-medium">{a.title}</p>
                <p className="text-red-400/70 text-xs mt-0.5 line-clamp-1">{a.description}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {a.status === "OPEN" && (
                  <button
                    onClick={() => doAction(a.id, "acknowledge")}
                    disabled={actionLoading === a.id + "acknowledge"}
                    className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-800/50 px-2.5 py-1 rounded-lg hover:bg-yellow-900/60 transition-colors"
                  >
                    Reconhecer
                  </button>
                )}
                <button
                  onClick={() => doAction(a.id, "resolve")}
                  disabled={actionLoading === a.id + "resolve"}
                  className="text-xs bg-green-900/40 text-green-400 border border-green-800/50 px-2.5 py-1 rounded-lg hover:bg-green-900/60 transition-colors"
                >
                  Resolver
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todos os status</option>
          <option value="OPEN">Aberto</option>
          <option value="ACKNOWLEDGED">Reconhecido</option>
          <option value="RESOLVED">Resolvido</option>
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todas severidades</option>
          <option value="CRITICAL">Crítico</option>
          <option value="WARNING">Aviso</option>
          <option value="INFO">Info</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-gray-600 py-8 text-center">Carregando...</div>
        ) : alerts.length === 0 ? (
          <div className="text-gray-600 py-12 text-center">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Nenhum alerta encontrado
          </div>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className={`bg-gray-900 border rounded-xl p-4 ${a.status === "RESOLVED" ? "border-gray-800 opacity-60" : "border-gray-800"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_STYLES[a.severity]}`}>
                      {a.severity}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[a.status]}`}>
                      {a.status === "OPEN" ? "Aberto" : a.status === "ACKNOWLEDGED" ? "Reconhecido" : "Resolvido"}
                    </span>
                    <span className="text-gray-600 text-xs">{TYPE_LABEL[a.type] ?? a.type}</span>
                  </div>
                  <p className="text-white text-sm font-medium">{a.title}</p>
                  <p className="text-gray-500 text-xs mt-1">{a.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                    {a.tenant && <span>Tenant: <span className="text-gray-400">{a.tenant.nome}</span></span>}
                    <span>{new Date(a.createdAt).toLocaleString("pt-BR")}</span>
                  </div>
                </div>
                {a.status !== "RESOLVED" && (
                  <div className="flex gap-2 shrink-0">
                    {a.status === "OPEN" && (
                      <button
                        onClick={() => doAction(a.id, "acknowledge")}
                        disabled={actionLoading === a.id + "acknowledge"}
                        className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Reconhecer
                      </button>
                    )}
                    <button
                      onClick={() => doAction(a.id, "resolve")}
                      disabled={actionLoading === a.id + "resolve"}
                      className="text-xs bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-800/50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Resolver
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Paginação */}
      {pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => { setPage(p); load(p); }}
              className={`w-8 h-8 rounded-lg text-sm ${p === page ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
