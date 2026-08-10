import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import platformApi from "../../lib/platformApi";

type ConvStatus = "ACTIVE" | "COMPLETED" | "ABANDONED";

interface ConvSummary {
  id: string;
  clientPhone: string;
  clientName: string | null;
  currentStep: string | null;
  status: ConvStatus;
  lastMessageAt: string;
  messageCount: number;
  lastMessage: { body: string; direction: string; createdAt: string } | null;
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  payload: string | null;
  stepAtTime: string | null;
  createdAt: string;
}

interface ConvDetail {
  id: string;
  clientPhone: string;
  clientName: string | null;
  currentStep: string | null;
  status: ConvStatus;
  lastMessageAt: string;
  createdAt: string;
  messages: Message[];
}

const STATUS_BADGE: Record<ConvStatus, string> = {
  ACTIVE: "bg-green-900/40 text-green-400",
  COMPLETED: "bg-blue-900/40 text-blue-400",
  ABANDONED: "bg-red-900/40 text-red-400",
};

const STATUS_LABEL: Record<ConvStatus, string> = {
  ACTIVE: "Ativa",
  COMPLETED: "Concluída",
  ABANDONED: "Abandonada",
};

export default function PlatformConversations() {
  const { id: tenantId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ConvDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filterStatus) params.set("status", filterStatus);
      const { data } = await platformApi.get(`/tenants/${tenantId}/conversations?${params}`);
      setConversations(data.conversations);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  async function loadThread(convId: string) {
    setLoadingThread(true);
    setSelectedId(convId);
    try {
      const { data } = await platformApi.get(`/conversations/${convId}`);
      setThread(data);
    } finally {
      setLoadingThread(false);
    }
  }

  useEffect(() => { load(); }, [filterStatus]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/platform/tenants/${tenantId}`)} className="text-gray-500 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Inspetor de Conversas</h1>
          <p className="text-gray-500 text-sm">{total} conversa{total !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="flex gap-4 h-[calc(100vh-180px)]">
        {/* Lista de conversas */}
        <div className="w-80 shrink-0 flex flex-col">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Todos os status</option>
            <option value="ACTIVE">Ativas</option>
            <option value="COMPLETED">Concluídas</option>
            <option value="ABANDONED">Abandonadas</option>
          </select>

          <div className="flex-1 overflow-y-auto space-y-2">
            {loading ? (
              <div className="text-gray-600 text-sm text-center py-8">Carregando...</div>
            ) : conversations.length === 0 ? (
              <div className="text-gray-600 text-sm text-center py-8">Nenhuma conversa.</div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadThread(c.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    selectedId === c.id
                      ? "border-indigo-600 bg-indigo-900/20"
                      : c.status === "ABANDONED"
                      ? "border-red-900/40 bg-red-900/10 hover:bg-red-900/20"
                      : "border-gray-800 bg-gray-900 hover:bg-gray-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-white text-sm font-medium truncate">
                      {c.clientName ?? c.clientPhone}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  {c.clientName && (
                    <div className="text-gray-600 text-xs mb-1">{c.clientPhone}</div>
                  )}
                  {c.currentStep && (
                    <div className="text-indigo-400 text-xs mb-1">Etapa: {c.currentStep}</div>
                  )}
                  {c.lastMessage && (
                    <div className="text-gray-500 text-xs truncate">
                      {c.lastMessage.direction === "outbound" ? "🤖 " : "👤 "}
                      {c.lastMessage.body}
                    </div>
                  )}
                  <div className="text-gray-700 text-xs mt-1">
                    {new Date(c.lastMessageAt).toLocaleString("pt-BR")}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-gray-600">
              Selecione uma conversa para ver o histórico
            </div>
          ) : loadingThread ? (
            <div className="flex-1 flex items-center justify-center text-gray-600">Carregando...</div>
          ) : thread ? (
            <>
              {/* Header da thread */}
              <div className="p-4 border-b border-gray-800 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white font-medium">{thread.clientName ?? thread.clientPhone}</span>
                    {thread.clientName && <span className="text-gray-500 text-sm ml-2">{thread.clientPhone}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {thread.currentStep && (
                      <span className="text-xs text-indigo-400 bg-indigo-900/30 px-2 py-0.5 rounded-full">
                        Etapa atual: {thread.currentStep}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[thread.status]}`}>
                      {STATUS_LABEL[thread.status]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {thread.messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] ${msg.direction === "outbound" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                      <div className={`px-3 py-2 rounded-2xl text-sm ${
                        msg.direction === "outbound"
                          ? "bg-indigo-700 text-white rounded-br-md"
                          : "bg-gray-800 text-gray-100 rounded-bl-md"
                      }`}>
                        {msg.body}
                        {msg.payload && msg.payload !== msg.body && (
                          <div className="mt-1 text-xs opacity-60 font-mono">payload: {msg.payload}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        {msg.stepAtTime && (
                          <span className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-500">
                            {msg.stepAtTime}
                          </span>
                        )}
                        <span>{new Date(msg.createdAt).toLocaleTimeString("pt-BR")}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
