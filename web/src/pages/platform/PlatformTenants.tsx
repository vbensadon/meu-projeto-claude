import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import platformApi from "../../lib/platformApi";

type TenantStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
type IntegrationStatus = "PENDING" | "CONNECTED" | "EXPIRED" | "ERROR";

interface Tenant {
  id: string;
  nome: string;
  slug: string;
  status: TenantStatus;
  whatsappStatus: IntegrationStatus;
  calendarStatus: IntegrationStatus;
  plano: string;
  created_at: string;
  usuarios: { nome: string; email: string }[];
  subscriptions: { status: string; plan: { name: string; priceMonthly: number } }[];
  _count: { agendamentos: number; profissionais: number };
}

const STATUS_BADGE: Record<TenantStatus, string> = {
  PROVISIONING: "bg-yellow-900/40 text-yellow-400 border border-yellow-800/50",
  ACTIVE: "bg-green-900/40 text-green-400 border border-green-800/50",
  SUSPENDED: "bg-red-900/40 text-red-400 border border-red-800/50",
  CANCELLED: "bg-gray-800 text-gray-500 border border-gray-700",
};

const INTEGRATION_DOT: Record<IntegrationStatus, string> = {
  PENDING: "bg-yellow-500",
  CONNECTED: "bg-green-500",
  EXPIRED: "bg-orange-500",
  ERROR: "bg-red-500",
};

export default function PlatformTenants() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page) };
      if (q) params.q = q;
      if (statusFilter) params.status = statusFilter;
      const { data } = await platformApi.get("/tenants", { params });
      setTenants(data.tenants);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [page, q, statusFilter]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Barbearias</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} tenant{total !== 1 ? "s" : ""} no total</p>
        </div>
        <Link
          to="/platform/tenants/new"
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nova barbearia
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por nome, slug ou email..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todos os status</option>
          <option value="PROVISIONING">Provisionando</option>
          <option value="ACTIVE">Ativo</option>
          <option value="SUSPENDED">Suspenso</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Carregando...</div>
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center text-gray-600">Nenhuma barbearia encontrada.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Barbearia</th>
                <th className="text-left px-4 py-3">Plano</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Integrações</th>
                <th className="text-left px-4 py-3">Agendamentos</th>
                <th className="text-left px-4 py-3">Criado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {tenants.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/platform/tenants/${t.id}`)}
                  className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{t.nome}</div>
                    <div className="text-gray-500 text-xs">{t.usuarios[0]?.email ?? t.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-300">{t.subscriptions[0]?.plan.name ?? t.plano}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[t.status]}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <span className={`w-1.5 h-1.5 rounded-full ${INTEGRATION_DOT[t.whatsappStatus]}`} />
                        WA
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <span className={`w-1.5 h-1.5 rounded-full ${INTEGRATION_DOT[t.calendarStatus]}`} />
                        Cal
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{t._count.agendamentos}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(t.created_at).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Paginação */}
        {pages > 1 && (
          <div className="border-t border-gray-800 px-4 py-3 flex items-center justify-between">
            <span className="text-gray-600 text-xs">Página {page} de {pages}</span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors"
              >
                Anterior
              </button>
              <button
                disabled={page === pages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
