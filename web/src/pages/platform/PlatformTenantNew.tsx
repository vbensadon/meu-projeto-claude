import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import platformApi from "../../lib/platformApi";

interface Plan { id: string; name: string; priceMonthly: number; maxBarbers: number; maxMessages: number }

interface FormData {
  barbershopName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  planId: string;
  bringOwnNumber: boolean;
  twilioNumber: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
}

type ProvisioningStep = { step: string; status: "success" | "failed" | "pending" };

const STEP_LABELS: Record<string, string> = {
  tenant_created: "Tenant criado",
  owner_user: "Usuário dono criado",
  bot_config: "Config. do bot",
  default_services: "Serviços padrão",
  subscription: "Assinatura criada",
  feature_flags: "Feature flags",
  whatsapp: "WhatsApp (aguardando)",
  google_calendar: "Google Calendar (aguardando)",
  welcome_email: "Email de boas-vindas",
};

const stepIcon = (status: string) => {
  if (status === "success") return (
    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
  if (status === "failed") return (
    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
  return <div className="w-4 h-4 rounded-full border-2 border-yellow-500 border-t-transparent animate-spin" />;
};

export default function PlatformTenantNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<FormData>({
    barbershopName: "", ownerName: "", ownerEmail: "", ownerPhone: "",
    planId: "", bringOwnNumber: false, twilioNumber: "", twilioAccountSid: "", twilioAuthToken: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ tenantId: string; slug: string; tempPassword: string } | null>(null);
  const [provLogs, setProvLogs] = useState<ProvisioningStep[]>([]);

  useEffect(() => {
    platformApi.get("/plans").then(({ data }) => setPlans(data));
  }, []);

  function set(field: keyof FormData, value: any) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    setStep(5);
    try {
      const { data } = await platformApi.post("/tenants/provision", form);
      setResult(data);

      // Buscar logs de provisionamento
      const { data: logs } = await platformApi.get(`/tenants/${data.tenantId}/provisioning-logs`);
      setProvLogs(logs);
    } catch (err: any) {
      setError(err.response?.data?.erro ?? "Erro ao provisionar.");
      setStep(4);
    } finally {
      setLoading(false);
    }
  }

  const progress = ((step - 1) / 4) * 100;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-white">Nova barbearia</h1>
      </div>

      {/* Progress bar */}
      {step < 5 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-600 mb-2">
            {["Barbearia", "Dono", "Plano", "WhatsApp"].map((label, i) => (
              <span key={label} className={i + 1 <= step ? "text-indigo-400" : ""}>{label}</span>
            ))}
          </div>
          <div className="h-1 bg-gray-800 rounded-full">
            <div className="h-1 bg-indigo-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        {/* Etapa 1: Dados da barbearia */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-white font-semibold mb-4">Dados da barbearia</h2>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Nome da barbearia *</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                value={form.barbershopName}
                onChange={(e) => set("barbershopName", e.target.value)}
                placeholder="Barbearia do João"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                disabled={!form.barbershopName.trim()}
                onClick={() => setStep(2)}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* Etapa 2: Dados do dono */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-white font-semibold mb-4">Dados do dono</h2>
            {[
              { label: "Nome completo *", field: "ownerName" as const, placeholder: "João Silva", type: "text" },
              { label: "Email *", field: "ownerEmail" as const, placeholder: "joao@email.com", type: "email" },
              { label: "Telefone (WhatsApp) *", field: "ownerPhone" as const, placeholder: "+5511999999999", type: "tel" },
            ].map(({ label, field, placeholder, type }) => (
              <div key={field}>
                <label className="text-xs text-gray-400 block mb-1.5">{label}</label>
                <input
                  type={type}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  value={form[field] as string}
                  onChange={(e) => set(field, e.target.value)}
                  placeholder={placeholder}
                />
              </div>
            ))}
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="text-gray-500 hover:text-white text-sm transition-colors">Voltar</button>
              <button
                disabled={!form.ownerName || !form.ownerEmail || !form.ownerPhone}
                onClick={() => setStep(3)}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* Etapa 3: Escolha do plano */}
        {step === 3 && (
          <div>
            <h2 className="text-white font-semibold mb-4">Escolha o plano</h2>
            <div className="space-y-3 mb-6">
              {plans.map((plan) => (
                <label
                  key={plan.id}
                  className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                    form.planId === plan.id
                      ? "border-indigo-500 bg-indigo-900/20"
                      : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="plan"
                      value={plan.id}
                      checked={form.planId === plan.id}
                      onChange={() => set("planId", plan.id)}
                      className="accent-indigo-500"
                    />
                    <div>
                      <div className="text-white font-medium text-sm">{plan.name}</div>
                      <div className="text-gray-500 text-xs">{plan.maxBarbers} barbeiros · {plan.maxMessages.toLocaleString()} msgs/mês</div>
                    </div>
                  </div>
                  <div className="text-indigo-400 font-semibold text-sm">R${plan.priceMonthly}/mês</div>
                </label>
              ))}
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="text-gray-500 hover:text-white text-sm transition-colors">Voltar</button>
              <button
                disabled={!form.planId}
                onClick={() => setStep(4)}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* Etapa 4: WhatsApp */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-white font-semibold mb-4">Número WhatsApp</h2>
            <div className="flex gap-3">
              {[
                { value: false, label: "Provisionar via Twilio", desc: "Número aprovado pela Twilio/Meta (assíncrono)" },
                { value: true, label: "Trazer próprio número (BYON)", desc: "Cliente já tem número WhatsApp Business" },
              ].map(({ value, label, desc }) => (
                <label
                  key={String(value)}
                  className={`flex-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                    form.bringOwnNumber === value
                      ? "border-indigo-500 bg-indigo-900/20"
                      : "border-gray-700 hover:border-gray-600"
                  }`}
                >
                  <input type="radio" name="waType" checked={form.bringOwnNumber === value}
                    onChange={() => set("bringOwnNumber", value)} className="hidden" />
                  <div className="text-white text-sm font-medium">{label}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{desc}</div>
                </label>
              ))}
            </div>
            {form.bringOwnNumber && (
              <div className="space-y-3 pt-2">
                {[
                  { label: "Número WhatsApp (+55...)", field: "twilioNumber" as const },
                  { label: "Twilio Account SID", field: "twilioAccountSid" as const },
                  { label: "Twilio Auth Token", field: "twilioAuthToken" as const },
                ].map(({ label, field }) => (
                  <div key={field}>
                    <label className="text-xs text-gray-400 block mb-1">{label}</label>
                    <input
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                      value={form[field] as string}
                      onChange={(e) => set(field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
            {error && <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2">{error}</div>}
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(3)} className="text-gray-500 hover:text-white text-sm transition-colors">Voltar</button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? "Provisionando..." : "Criar barbearia"}
              </button>
            </div>
          </div>
        )}

        {/* Etapa 5: Progresso e resultado */}
        {step === 5 && (
          <div>
            <h2 className="text-white font-semibold mb-5">{result ? "Barbearia criada!" : "Provisionando..."}</h2>

            {/* Checklist de passos */}
            <div className="space-y-2 mb-6">
              {(result
                ? provLogs
                : Object.keys(STEP_LABELS).map((step) => ({ step, status: "pending" as const }))
              ).map((log) => (
                <div key={log.step} className="flex items-center gap-3 text-sm">
                  {stepIcon(log.status)}
                  <span className={log.status === "success" ? "text-gray-300" : log.status === "failed" ? "text-red-400" : "text-gray-600"}>
                    {STEP_LABELS[log.step] ?? log.step}
                  </span>
                </div>
              ))}
            </div>

            {result && (
              <>
                <div className="bg-gray-800 rounded-lg p-4 mb-5 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Slug</span>
                    <span className="text-white font-mono">{result.slug}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Senha temporária</span>
                    <span className="text-yellow-400 font-mono">{result.tempPassword}</span>
                  </div>
                </div>

                <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-3 text-xs text-yellow-400 mb-5">
                  Pendente: o dono precisa autorizar o Google Calendar e, se for número Twilio, aguardar aprovação da Meta.
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => navigate(`/platform/tenants/${result.tenantId}`)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                  >
                    Ver detalhes
                  </button>
                  <button
                    onClick={() => navigate("/platform/tenants")}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-lg text-sm transition-colors"
                  >
                    Lista de tenants
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
