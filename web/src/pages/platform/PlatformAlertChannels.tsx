import { useEffect, useState } from "react";
import platformApi from "../../lib/platformApi";

interface Channel {
  id?: string;
  channel: string;
  target: string;
  minSeverity: string;
  enabled: boolean;
}

const SEVERITY_OPTIONS = ["INFO", "WARNING", "CRITICAL"];
const CHANNEL_OPTIONS = ["email", "slack", "whatsapp"];

export default function PlatformAlertChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await platformApi.get("/alerts/channels");
      setChannels(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function add() {
    setChannels((prev) => [...prev, { channel: "email", target: "", minSeverity: "WARNING", enabled: true }]);
  }

  function remove(i: number) {
    setChannels((prev) => prev.filter((_, idx) => idx !== i));
  }

  function update(i: number, field: keyof Channel, value: string | boolean) {
    setChannels((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }

  async function save() {
    setSaving(true);
    try {
      await platformApi.put("/alerts/channels", channels);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-600">Carregando...</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Canais de notificação</h1>
          <p className="text-gray-500 text-sm mt-0.5">Configure para onde os alertas são enviados automaticamente.</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
            saved ? "bg-green-700 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}
        >
          {saved ? "Salvo!" : saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      <div className="space-y-3 mb-5">
        {channels.length === 0 && (
          <div className="text-gray-600 text-sm text-center py-8 bg-gray-900 border border-gray-800 rounded-xl">
            Nenhum canal configurado.
          </div>
        )}
        {channels.map((ch, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-gray-500 text-xs mb-1 block">Canal</label>
                <select
                  value={ch.channel}
                  onChange={(e) => update(i, "channel", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                >
                  {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1 block">Severidade mínima</label>
                <select
                  value={ch.minSeverity}
                  onChange={(e) => update(i, "minSeverity", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                >
                  {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-gray-500 text-xs mb-1 block">
                {ch.channel === "email" ? "Endereço de email" : ch.channel === "slack" ? "Webhook URL do Slack" : "Número WhatsApp (+55...)"}
              </label>
              <input
                type="text"
                value={ch.target}
                onChange={(e) => update(i, "target", e.target.value)}
                placeholder={ch.channel === "email" ? "ops@agendabot.com.br" : ch.channel === "slack" ? "https://hooks.slack.com/..." : "+5511999999999"}
                className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ch.enabled}
                  onChange={(e) => update(i, "enabled", e.target.checked)}
                  className="w-4 h-4 accent-indigo-500"
                />
                Ativo
              </label>
              {ch.channel !== "email" && (
                <span className="text-xs text-gray-600 italic">stub — disponível em breve</span>
              )}
              <button
                onClick={() => remove(i)}
                className="text-xs text-red-500 hover:text-red-400"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={add}
        className="w-full text-sm border border-dashed border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 rounded-xl py-3 transition-colors"
      >
        + Adicionar canal
      </button>
    </div>
  );
}
