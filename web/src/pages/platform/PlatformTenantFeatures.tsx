import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import platformApi from "../../lib/platformApi";

const KNOWN_FLAGS = [
  { key: "commissions", label: "Comissões", desc: "Cálculo e gestão de comissões por barbeiro" },
  { key: "campaigns", label: "Campanhas WhatsApp", desc: "Disparos em massa segmentados por perfil de cliente" },
  { key: "interactive_messages", label: "Mensagens interativas", desc: "Botões e listas no WhatsApp (precisa de conta Business)" },
  { key: "waitlist", label: "Fila de espera", desc: "Notificação automática quando horário cancela" },
  { key: "priority_support", label: "Suporte prioritário", desc: "Canal de suporte com resposta garantida em 2h" },
];

export default function PlatformTenantFeatures() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [tenantName, setTenantName] = useState("");
  const [saving, setSaving] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      platformApi.get(`/tenants/${id}/features`),
      platformApi.get(`/tenants/${id}`),
    ]).then(([featRes, detailRes]) => {
      setFeatures(featRes.data);
      setTenantName(detailRes.data.tenant.nome);
    }).finally(() => setLoading(false));
  }, [id]);

  async function toggle(key: string, enabled: boolean) {
    setSaving(key);
    try {
      await platformApi.put(`/tenants/${id}/features`, { key, enabled });
      setFeatures((f) => ({ ...f, [key]: enabled }));
    } finally {
      setSaving("");
    }
  }

  if (loading) return <div className="p-8 text-gray-600">Carregando...</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/platform/tenants/${id}`)} className="text-gray-500 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Feature Flags</h1>
          <p className="text-gray-500 text-sm">{tenantName}</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
        {KNOWN_FLAGS.map(({ key, label, desc }) => {
          const enabled = features[key] ?? false;
          return (
            <div key={key} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="text-white text-sm font-medium">{label}</div>
                <div className="text-gray-500 text-xs mt-0.5">{desc}</div>
              </div>
              <button
                onClick={() => toggle(key, !enabled)}
                disabled={saving === key}
                className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? "bg-indigo-600" : "bg-gray-700"}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          );
        })}

        {/* Flags customizadas que não estão na lista conhecida */}
        {Object.entries(features)
          .filter(([key]) => !KNOWN_FLAGS.some((f) => f.key === key))
          .map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="text-white text-sm font-medium font-mono">{key}</div>
                <div className="text-gray-600 text-xs">Flag customizada</div>
              </div>
              <button
                onClick={() => toggle(key, !enabled)}
                disabled={saving === key}
                className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? "bg-indigo-600" : "bg-gray-700"}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
