import { useEffect, useState } from "react";
import platformApi from "../../lib/platformApi";

interface Plan {
  id: string; name: string; priceMonthly: number;
  maxBarbers: number; maxMessages: number;
  features: Record<string, boolean>; active: boolean;
}

const EMPTY: Omit<Plan, "id"> = { name: "", priceMonthly: 0, maxBarbers: 2, maxMessages: 500, features: {}, active: true };

export default function PlatformPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Partial<Plan> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await platformApi.get("/plans");
    setPlans(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      if (isNew) {
        await platformApi.post("/plans", editing);
      } else {
        await platformApi.put(`/plans/${editing.id}`, editing);
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.erro ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-600">Carregando...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Planos</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gerencie os planos disponíveis na plataforma</p>
        </div>
        <button
          onClick={() => { setIsNew(true); setEditing({ ...EMPTY }); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Novo plano
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {plans.map((plan) => (
          <div key={plan.id} className={`bg-gray-900 border rounded-xl p-5 ${plan.active ? "border-gray-800" : "border-gray-800 opacity-60"}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-white font-semibold">{plan.name}</h3>
                {!plan.active && <span className="text-xs text-gray-600">Inativo</span>}
              </div>
              <button
                onClick={() => { setIsNew(false); setEditing({ ...plan }); }}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
                </svg>
              </button>
            </div>
            <div className="text-indigo-400 text-2xl font-bold mb-3">R${plan.priceMonthly}<span className="text-sm font-normal text-gray-500">/mês</span></div>
            <div className="space-y-1 text-sm text-gray-400">
              <div>Até {plan.maxBarbers} barbeiros</div>
              <div>Até {plan.maxMessages.toLocaleString()} msgs/mês</div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de edição */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-white font-semibold mb-5">{isNew ? "Novo plano" : "Editar plano"}</h2>
            <div className="space-y-4">
              {[
                { label: "Nome", field: "name" as const, type: "text" },
                { label: "Preço mensal (R$)", field: "priceMonthly" as const, type: "number" },
                { label: "Máx. barbeiros", field: "maxBarbers" as const, type: "number" },
                { label: "Máx. mensagens/mês", field: "maxMessages" as const, type: "number" },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label className="text-xs text-gray-400 block mb-1">{label}</label>
                  <input
                    type={type}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    value={editing[field] as any}
                    onChange={(e) => setEditing((prev) => ({ ...prev!, [field]: type === "number" ? Number(e.target.value) : e.target.value }))}
                  />
                </div>
              ))}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-400">Ativo</label>
                <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing((p) => ({ ...p!, active: e.target.checked }))} className="accent-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg text-sm transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm transition-colors">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
