import { useEffect, useState, useCallback } from "react";
import platformApi from "../../lib/platformApi";

interface AuditLog {
  id: string;
  action: string;
  targetTenantId: string | null;
  metadata: any;
  ipAddress: string | null;
  createdAt: string;
  platformUser: { name: string; email: string; role: string };
}

const ACTION_COLORS: Record<string, string> = {
  "tenant.provision": "text-green-400",
  "tenant.suspend": "text-yellow-400",
  "tenant.reactivate": "text-blue-400",
  "tenant.cancel": "text-orange-400",
  "tenant.delete": "text-red-400",
  "tenant.impersonate": "text-purple-400",
  "tenant.plan_changed": "text-indigo-400",
  "tenant.export": "text-gray-400",
};

export default function PlatformAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page) };
      if (action) params.action = action;
      if (from) params.from = from;
      if (to) params.to = to;
      const { data } = await platformApi.get("/audit", { params });
      setLogs(data.logs);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [page, action, from, to]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Log de Auditoria</h1>
        <p className="text-gray-500 text-sm mt-0.5">{total} registros</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Filtrar por ação (ex: tenant.suspend)"
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Carregando...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-600">Nenhum registro.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Ação</th>
                <th className="text-left px-4 py-3">Por</th>
                <th className="text-left px-4 py-3">Tenant alvo</th>
                <th className="text-left px-4 py-3">IP</th>
                <th className="text-left px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`font-mono text-xs ${ACTION_COLORS[log.action] ?? "text-gray-400"}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white text-xs">{log.platformUser.name}</div>
                    <div className="text-gray-600 text-xs">{log.platformUser.role}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                    {log.targetTenantId ? log.targetTenantId.slice(0, 8) + "..." : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{log.ipAddress ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(log.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <div className="border-t border-gray-800 px-4 py-3 flex items-center justify-between">
            <span className="text-gray-600 text-xs">Página {page} de {pages}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors">Anterior</button>
              <button disabled={page === pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors">Próxima</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
