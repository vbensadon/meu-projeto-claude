import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Tenant, LembreteHistorico } from "../lib/types";

const MSG_PADRAO =
  "Olá, {clientName}! 👋\n" +
  "Lembrando do seu agendamento amanhã:\n" +
  "📅 {date} às {time}\n" +
  "✂️ {serviceName} com {barberName}\n\n" +
  "Responda *CONFIRMAR* para confirmar ou *CANCELAR* para cancelar.";

const PREVIEW_VARS = {
  clientName: "João Silva",
  date: "15/07/2026",
  time: "10:00",
  serviceName: "Corte de Cabelo",
  barberName: "Carlos",
};

function renderizarPreview(template: string): string {
  return Object.entries(PREVIEW_VARS).reduce(
    (t, [key, val]) => t.replace(new RegExp(`\\{${key}\\}`, "g"), val),
    template
  );
}

type Aba = "geral" | "lembretes";

export default function Configuracoes() {
  const [aba, setAba] = useState<Aba>("geral");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ nome: "", telefone_whatsapp: "", twilio_account_sid: "", google_calendar_id_dono: "" });
  const [senhaForm, setSenhaForm] = useState({ senha_atual: "", nova_senha: "", confirmar: "" });
  const [msg, setMsg] = useState("");
  const [msgSenha, setMsgSenha] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [lembretesAtivos, setLembretesAtivos] = useState(true);
  const [mensagemLembrete, setMensagemLembrete] = useState("");
  const [msgLembretes, setMsgLembretes] = useState("");
  const [historico, setHistorico] = useState<LembreteHistorico[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  useEffect(() => {
    api.get<Tenant>("/configuracoes").then((r) => {
      setTenant(r.data);
      setForm({
        nome: r.data.nome,
        telefone_whatsapp: r.data.telefone_whatsapp,
        twilio_account_sid: r.data.twilio_account_sid,
        google_calendar_id_dono: r.data.google_calendar_id_dono ?? "",
      });
      setLembretesAtivos(r.data.lembretes_ativos);
      setMensagemLembrete(r.data.mensagem_lembrete ?? "");
    });
  }, []);

  useEffect(() => {
    if (aba !== "lembretes") return;
    setCarregandoHistorico(true);
    api
      .get<LembreteHistorico[]>("/lembretes/historico")
      .then((r) => setHistorico(r.data))
      .finally(() => setCarregandoHistorico(false));
  }, [aba]);

  const salvarDados = async () => {
    setSalvando(true); setMsg("");
    try {
      await api.put("/configuracoes", form);
      setMsg("Dados salvos com sucesso.");
    } catch {
      setMsg("Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const salvarSenha = async () => {
    if (senhaForm.nova_senha !== senhaForm.confirmar) {
      setMsgSenha("As senhas não coincidem."); return;
    }
    setSalvando(true); setMsgSenha("");
    try {
      await api.put("/configuracoes/senha", {
        senha_atual: senhaForm.senha_atual,
        nova_senha: senhaForm.nova_senha,
      });
      setSenhaForm({ senha_atual: "", nova_senha: "", confirmar: "" });
      setMsgSenha("Senha alterada com sucesso.");
    } catch {
      setMsgSenha("Senha atual incorreta.");
    } finally {
      setSalvando(false);
    }
  };

  const salvarLembretes = async () => {
    setSalvando(true); setMsgLembretes("");
    try {
      await api.put("/configuracoes", {
        lembretes_ativos: lembretesAtivos,
        mensagem_lembrete: mensagemLembrete.trim() || null,
      });
      setMsgLembretes("Configurações de lembretes salvas.");
    } catch {
      setMsgLembretes("Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  if (!tenant) return <div className="p-8 text-center text-ab-muted">Carregando...</div>;

  const inputClass = "w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200";
  const ehErroMsg = (m: string) => m.includes("Erro") || m.includes("incorreta") || m.includes("coincidem");
  const labelSenha = (campo: string) => campo === "senha_atual" ? "Senha atual" : campo === "nova_senha" ? "Nova senha" : "Confirmar nova senha";
  const templatePreview = mensagemLembrete.trim() || MSG_PADRAO;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-ab-text">Configurações</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-ab-card border border-ab-border rounded-card p-1">
        {(["geral", "lembretes"] as Aba[]).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`flex-1 text-sm py-2 rounded-input font-medium transition-all duration-200 capitalize ${
              aba === a
                ? "bg-ab-accent/15 text-ab-accent"
                : "text-ab-muted hover:text-ab-text"
            }`}
          >
            {a === "geral" ? "Geral" : "Lembretes"}
          </button>
        ))}
      </div>

      {aba === "geral" && (
        <>
          {/* Dados gerais */}
          <section className="bg-ab-card rounded-card border border-ab-border p-5 space-y-4">
            <h2 className="font-semibold text-ab-text">Dados do estabelecimento</h2>
            <div>
              <label className="text-xs text-ab-muted block mb-1.5">Nome</label>
              <input className={inputClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-ab-muted block mb-1.5">Número WhatsApp (Twilio)</label>
              <input className={inputClass} value={form.telefone_whatsapp} onChange={(e) => setForm({ ...form, telefone_whatsapp: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-ab-muted block mb-1.5">Twilio Account SID</label>
              <input className={inputClass} value={form.twilio_account_sid} onChange={(e) => setForm({ ...form, twilio_account_sid: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-ab-muted block mb-1.5">Google Calendar ID (padrão do dono)</label>
              <input className={inputClass} value={form.google_calendar_id_dono} onChange={(e) => setForm({ ...form, google_calendar_id_dono: e.target.value })} placeholder="primary ou ID do calendário" />
            </div>
            {msg && <p className={`text-sm ${ehErroMsg(msg) ? "text-ab-danger" : "text-ab-teal"}`}>{msg}</p>}
            <button onClick={salvarDados} disabled={salvando}
              className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200">
              {salvando ? "Salvando..." : "Salvar dados"}
            </button>
          </section>

          {/* Google Calendar OAuth */}
          <section className="bg-ab-card rounded-card border border-ab-border p-5 space-y-3">
            <h2 className="font-semibold text-ab-text">Google Calendar</h2>
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${tenant.google_calendar_conectado ? "bg-ab-teal shadow-lg shadow-ab-teal/40" : "bg-ab-danger shadow-lg shadow-ab-danger/40"}`} />
              <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${tenant.google_calendar_conectado ? "bg-ab-teal/15 text-ab-teal" : "bg-ab-danger/15 text-ab-danger"}`}>
                {tenant.google_calendar_conectado ? "Conectado" : "Não conectado"}
              </span>
            </div>
            <a href="/api/google/autorizar"
              className="inline-block border border-ab-border text-ab-muted text-sm px-4 py-2 rounded-input hover:bg-ab-hover hover:text-ab-text transition-all duration-200">
              {tenant.google_calendar_conectado ? "Reconectar Google Calendar" : "Conectar Google Calendar"}
            </a>
          </section>

          {/* Troca de senha */}
          <section className="bg-ab-card rounded-card border border-ab-border p-5 space-y-4">
            <h2 className="font-semibold text-ab-text">Alterar senha</h2>
            {(["senha_atual", "nova_senha", "confirmar"] as const).map((campo) => (
              <div key={campo}>
                <label className="text-xs text-ab-muted block mb-1.5">{labelSenha(campo)}</label>
                <input type="password" className={inputClass} value={senhaForm[campo]} onChange={(e) => setSenhaForm({ ...senhaForm, [campo]: e.target.value })} />
              </div>
            ))}
            {msgSenha && <p className={`text-sm ${ehErroMsg(msgSenha) ? "text-ab-danger" : "text-ab-teal"}`}>{msgSenha}</p>}
            <button onClick={salvarSenha} disabled={salvando}
              className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200">
              Alterar senha
            </button>
          </section>
        </>
      )}

      {aba === "lembretes" && (
        <>
          {/* Toggle + mensagem */}
          <section className="bg-ab-card rounded-card border border-ab-border p-5 space-y-5">
            <h2 className="font-semibold text-ab-text">Lembretes automáticos</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ab-text font-medium">Ativar lembretes</p>
                <p className="text-xs text-ab-muted mt-0.5">Envia WhatsApp 24h antes do agendamento</p>
              </div>
              <button
                onClick={() => setLembretesAtivos(!lembretesAtivos)}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${lembretesAtivos ? "bg-ab-accent" : "bg-ab-border"}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${lembretesAtivos ? "left-6" : "left-1"}`} />
              </button>
            </div>

            <div>
              <label className="text-xs text-ab-muted block mb-1.5">
                Mensagem personalizada{" "}
                <span className="text-ab-muted/60">(vazio = usa o padrão)</span>
              </label>
              <textarea
                className={`${inputClass} min-h-[140px] resize-y font-mono text-xs`}
                value={mensagemLembrete}
                onChange={(e) => setMensagemLembrete(e.target.value)}
                placeholder={MSG_PADRAO}
              />
              <p className="text-xs text-ab-muted mt-1.5">
                Variáveis: <code className="text-ab-accent">{"{clientName}"}</code>{" "}
                <code className="text-ab-accent">{"{date}"}</code>{" "}
                <code className="text-ab-accent">{"{time}"}</code>{" "}
                <code className="text-ab-accent">{"{serviceName}"}</code>{" "}
                <code className="text-ab-accent">{"{barberName}"}</code>
              </p>
            </div>

            {/* Preview */}
            <div className="bg-ab-bg border border-ab-border rounded-input p-4">
              <p className="text-xs text-ab-muted mb-2 font-medium uppercase tracking-wide">Preview</p>
              <p className="text-sm text-ab-text whitespace-pre-wrap">{renderizarPreview(templatePreview)}</p>
            </div>

            {msgLembretes && (
              <p className={`text-sm ${ehErroMsg(msgLembretes) ? "text-ab-danger" : "text-ab-teal"}`}>{msgLembretes}</p>
            )}
            <button onClick={salvarLembretes} disabled={salvando}
              className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200">
              {salvando ? "Salvando..." : "Salvar configurações"}
            </button>
          </section>

          {/* Histórico */}
          <section className="bg-ab-card rounded-card border border-ab-border overflow-x-auto">
            <div className="px-5 py-4 border-b border-ab-border">
              <h2 className="font-semibold text-ab-text">Histórico de lembretes</h2>
              <p className="text-xs text-ab-muted mt-0.5">Últimos 50 lembretes enviados</p>
            </div>
            {carregandoHistorico ? (
              <p className="p-6 text-center text-ab-muted text-sm">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="p-6 text-center text-ab-muted text-sm">Nenhum lembrete enviado ainda.</p>
            ) : (
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="text-left text-ab-muted border-b border-ab-border">
                    <th className="px-5 py-3 font-medium">Cliente</th>
                    <th className="px-5 py-3 font-medium">Agendamento</th>
                    <th className="px-5 py-3 font-medium">Enviado em</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ab-border/50">
                  {historico.map((h) => (
                    <tr key={h.id} className="hover:bg-ab-hover/50 transition-colors duration-150">
                      <td className="px-5 py-3.5 font-medium text-ab-text whitespace-nowrap">{h.cliente_nome}</td>
                      <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">
                        {new Date(h.data_hora).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">
                        {new Date(h.lembrete_enviado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                          h.lembrete_status === "entregue"
                            ? "bg-ab-teal/15 text-ab-teal"
                            : "bg-ab-danger/15 text-ab-danger"
                        }`}>
                          {h.lembrete_status === "entregue" ? "Entregue" : "Falhou"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
