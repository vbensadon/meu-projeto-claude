import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import platformApi from "../../lib/platformApi";

interface FunnelStep {
  key: string;
  label: string;
  count: number;
  taxaConversao: number;
  mediaDiasParaChegar: number | null;
}

interface FunnelData {
  total: number;
  funil: FunnelStep[];
  gargalo: string | null;
}

interface StuckTenant {
  id: string;
  nome: string;
  slug: string;
  status: string;
  etapaAtual: string;
  diasNaEtapa: number;
  owner: { nome: string; email: string } | null;
}

const STEP_KEYS = ["criado", "primeiro_login", "calendar_conectado", "whatsapp_conectado", "primeiro_agendamento"];

const STEP_TIPS: Record<string, string> = {
  criado: "Tenant criado, aguardando primeiro acesso.",
  primeiro_login: "Dono nunca acessou o painel.",
  calendar_conectado: "Google Calendar não conectado.",
  whatsapp_conectado: "WhatsApp aguardando aprovação ou não configurado.",
  primeiro_agendamento: "Sistema ativo mas sem agendamentos ainda.",
};

export default function PlatformOnboarding() {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [stuck, setStuck] = useState<StuckTenant[]>([]);
  const [stuckTotal, setStuckTotal] = useState(0);
  const [selectedStep, setSelectedStep] = useState("criado");
  const [stuckDays, setStuckDays] = useState(3);
  const [loading, setLoading] = useState(true);
  const [loadingStuck, setLoadingStuck] = useState(false);
  const [resendLoading, setResendLoading] = useState("");

  async function loadFunnel() {
    setLoading(true);
    try {
      const { data } = await platformApi.get("/onboarding/funnel");
      setFunnel(data);
    } finally {
      setLoading(false);
    }
  }

  async function loadStuck(step = selectedStep, days = stuckDays) {
    setLoadingStuck(true);
    try {
      const { data } = await platformApi.get(`/onboarding/stuck?step=${step}&days=${days}`);
      setStuck(data.tenants);
      setStuckTotal(data.total);
    } finally {
      setLoadingStuck(false);
    }
  }

  async function resendOnboarding(tenantId: string) {
    setResendLoading(tenantId);
    try {
      await platformApi.post(`/tenants/${tenantId}/resend-onboarding`);
    } finally {
      setResendLoading("");
    }
  }

  useEffect(() => { loadFunnel(); }, []);
  useEffect(() => { loadStuck(selectedStep, stuckDays); }, [selectedStep, stuckDays]);

  if (loading) return <div className="p-8 text-gray-600">Carregando...</div>;
  if (!funnel) return <div className="p-8 text-red-400">Erro ao carregar funil.</div>;

  const maxCount = funnel.funil[0]?.count ?? 1;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Funil de Onboarding</h1>
        <p className="text-gray-500 text-sm mt-0.5">{funnel.total} tenants ativos no total</p>
      </div>

      {/* Funil visual */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="space-y-3">
          {funnel.funil.map((step, i) => {
            const isGargalo = step.key === funnel.gargalo;
            const width = maxCount > 0 ? (step.count / maxCount) * 100 : 0;

            return (
              <div key={step.key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${isGargalo ? "text-red-400 font-medium" : "text-gray-300"}`}>
                      {step.label}
                    </span>
                    {isGargalo && (
                      <span className="text-xs bg-red-900/40 text-red-400 border border-red-800/50 px-1.5 py-0.5 rounded-full">
                        Gargalo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {i > 0 && (
                      <span className={`text-xs ${step.taxaConversao < 50 ? "text-red-400" : step.taxaConversao < 75 ? "text-yellow-400" : "text-green-400"}`}>
                        {step.taxaConversao}% conversão
                      </span>
                    )}
                    <span className="text-white font-medium w-8 text-right">{step.count}</span>
                  </div>
                </div>
                <div className="h-8 bg-gray-800 rounded-lg overflow-hidden">
                  <div
                    className={`h-full rounded-lg transition-all duration-500 ${isGargalo ? "bg-red-700/60" : i === funnel.funil.length - 1 ? "bg-green-700/60" : "bg-indigo-700/50"}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                {step.mediaDiasParaChegar !== null && (
                  <div className="text-gray-600 text-xs mt-0.5">
                    Média: {step.mediaDiasParaChegar} dia{step.mediaDiasParaChegar !== 1 ? "s" : ""} para chegar aqui
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tenants travados */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">
            Travados na etapa
            {stuckTotal > 0 && <span className="ml-2 text-red-400 text-xs bg-red-900/30 px-1.5 py-0.5 rounded-full">{stuckTotal}</span>}
          </h2>
          <div className="flex gap-3">
            <select
              value={selectedStep}
              onChange={(e) => setSelectedStep(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              {STEP_KEYS.map((k) => (
                <option key={k} value={k}>{funnel.funil.find((s) => s.key === k)?.label ?? k}</option>
              ))}
            </select>
            <select
              value={stuckDays}
              onChange={(e) => setStuckDays(parseInt(e.target.value))}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value={1}>Há 1+ dia</option>
              <option value={3}>Há 3+ dias</option>
              <option value={7}>Há 7+ dias</option>
              <option value={14}>Há 14+ dias</option>
            </select>
          </div>
        </div>

        {selectedStep && STEP_TIPS[selectedStep] && (
          <p className="text-gray-500 text-xs mb-4 bg-gray-800/50 rounded-lg px-3 py-2">
            💡 {STEP_TIPS[selectedStep]}
          </p>
        )}

        {loadingStuck ? (
          <div className="text-gray-600 text-sm py-4 text-center">Carregando...</div>
        ) : stuck.length === 0 ? (
          <div className="text-gray-600 text-sm py-6 text-center">
            Nenhum tenant travado nesta etapa por mais de {stuckDays} dia{stuckDays !== 1 ? "s" : ""}.
          </div>
        ) : (
          <div className="space-y-2">
            {stuck.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/platform/tenants/${t.id}`} className="text-white text-sm hover:text-indigo-400 transition-colors">
                      {t.nome}
                    </Link>
                    <span className="text-red-400 text-xs">{t.diasNaEtapa} dia{t.diasNaEtapa !== 1 ? "s" : ""} aqui</span>
                  </div>
                  {t.owner && (
                    <div className="text-gray-500 text-xs mt-0.5">
                      {t.owner.nome} • {t.owner.email}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => resendOnboarding(t.id)}
                  disabled={resendLoading === t.id}
                  className="text-xs bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-400 border border-indigo-800/50 px-3 py-1.5 rounded-lg transition-colors shrink-0 ml-3"
                >
                  {resendLoading === t.id ? "Enviando..." : "Reenviar instruções"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
