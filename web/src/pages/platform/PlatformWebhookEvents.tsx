import { useEffect, useState } from "react";
import platformApi from "../../lib/platformApi";

type EventStatus = "RECEIVED" | "PROCESSED" | "FAILED";

interface WebhookEvent {
  id: string;
  tenantId: string | null;
  source: string;
  eventId: string | null;
  payload: Record<string, unknown>;
  status: EventStatus;
  attempts: number;
  lastError: string | null;
  processedAt: string | null;
  createdAt: string;
  tenant: { id: string; nome: string; slug: string } | null;
}

const STATUS_BADGE: Record<EventStatus, string> = {
  RECEIVED: "bg-yellow-900/40 text-yellow-400",
  PROCESSED: "bg-green-900/40 text-green-400",
  FAILED: "bg-red-900/40 text-red-400",
};

export default function PlatformWebhookEvents() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [replayLoading, setReplayLoading] = useState("");
  const [replayResult, setReplayResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [expandedPayload, setExpandedPayload] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState("FAILED");
  const [filterSource, setFilterSource] = useState("");

  async function load(p = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "25" });
      if (filterStatus) params.set("status", filterStatus);
      if (filterSource) params.set("source", filterSource);
      const { data } = await platformApi.get(`/webhook-events?${params}`);
      setEvents(data.events);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); setPage(1); }, [filterStatus, filterSource]);

  async function replay(id: string) {
    setReplayLoading(id);
    setReplayResult(null);
    try {
      const { data } = await platformApi.post(`/webhook-events/${id}/replay`);
      setReplayResult({ id, ok: data.ok, msg: data.message ?? data.erro ?? "Concluído" });
      await load(page);
    } catch (err: any) {
      setReplayResult({ id, ok: false, msg: err.response?.data?.erro ?? "Erro no replay" });
    } finally {
      setReplayLoading("");
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Eventos de Webhook</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} evento{total !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {replayResult && (
        <div className={`mb-4 p-3 rounded-xl text-sm border ${replayResult.ok ? "bg-green-900/20 border-green-800/50 text-green-400" : "bg-red-900/20 border-red-800/50 text-red-400"}`}>
          {replayResult.msg}
          <button onClick={() => setReplayResult(null)} className="ml-3 text-xs opacity-60 hover:opacity-100">×</button>
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
          <option value="FAILED">Falhos</option>
          <option value="RECEIVED">Pendentes</option>
          <option value="PROCESSED">Processados</option>
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todas as fontes</option>
          <option value="twilio">Twilio</option>
          <option value="calendar">Calendar</option>
          <option value="payment">Payment</option>
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-gray-600 py-8 text-center">Carregando...</div>
        ) : events.length === 0 ? (
          <div className="text-gray-600 py-12 text-center">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Nenhum evento encontrado
          </div>
        ) : (
          events.map((e) => (
            <div key={e.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[e.status]}`}>{e.status}</span>
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{e.source}</span>
                    {e.attempts > 1 && (
                      <span className="text-xs text-orange-400">{e.attempts} tentativas</span>
                    )}
                    {e.tenant && (
                      <span className="text-xs text-gray-500">{e.tenant.nome}</span>
                    )}
                  </div>
                  {e.eventId && (
                    <div className="text-gray-600 text-xs font-mono mb-1">{e.eventId}</div>
                  )}
                  {e.lastError && (
                    <div className="text-red-400 text-xs bg-red-900/20 rounded-lg px-2 py-1 mt-1 font-mono">
                      {e.lastError}
                    </div>
                  )}
                  <div className="text-gray-600 text-xs mt-1">
                    {new Date(e.createdAt).toLocaleString("pt-BR")}
                    {e.processedAt && <span className="ml-2">→ processado {new Date(e.processedAt).toLocaleString("pt-BR")}</span>}
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setExpandedPayload(expandedPayload === e.id ? null : e.id)}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Payload
                  </button>
                  {e.status !== "PROCESSED" && (
                    <button
                      onClick={() => replay(e.id)}
                      disabled={replayLoading === e.id}
                      className="text-xs bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-400 border border-indigo-800/50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {replayLoading === e.id ? "Reprocessando..." : "Reprocessar"}
                    </button>
                  )}
                </div>
              </div>

              {expandedPayload === e.id && (
                <div className="border-t border-gray-800 p-4 bg-gray-950">
                  <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap max-h-48 font-mono">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((p) => (
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
