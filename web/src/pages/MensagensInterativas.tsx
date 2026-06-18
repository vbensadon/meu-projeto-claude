import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

// ── tipos ─────────────────────────────────────────────────────────────────

type Formato = "AUTOMATICO" | "QUICK_REPLY" | "LISTA" | "TEXTO";
type StatusTemplate = "pendente" | "aprovado" | "rejeitado";

interface EtapaConfig {
  etapa: string;
  corpo_texto: string;
  formato: Formato;
  labels_botoes: string[];
  ativo: boolean;
  customizado: boolean;
  variaveis_disponiveis: string[];
}

interface Template {
  id: string;
  chave: string;
  content_sid: string;
  status: StatusTemplate;
}

const NOMES: Record<string, string> = {
  BOAS_VINDAS:             "Boas-vindas / Lista de serviços",
  ESCOLHA_SERVICO:         "Escolha do serviço (re-seleção)",
  ESCOLHA_PROFISSIONAL:    "Escolha do profissional",
  ESCOLHA_DATA:            "Escolha da data",
  ESCOLHA_HORARIO:         "Escolha do horário",
  FILA_ESPERA_PROMPT:      "Oferta de fila de espera",
  CONFIRMACAO_AGENDAMENTO: "Confirmação do agendamento",
  LEMBRETE:                "Lembrete 24h antes",
  VAGA_FILA_ESPERA:        "Vaga disponível na fila",
};

const FORMATO_LABELS: Record<Formato, string> = {
  AUTOMATICO:  "Automático (recomendado)",
  QUICK_REPLY: "Botões (Quick Reply)",
  LISTA:       "Lista selecionável",
  TEXTO:       "Texto simples",
};

const CHAVES_TEMPLATE = ["lembrete_24h", "vaga_fila_espera"] as const;
const NOMES_TEMPLATE: Record<string, string> = {
  lembrete_24h:     "Lembrete 24h antes",
  vaga_fila_espera: "Vaga disponível na fila",
};

// ── preview de bolha WhatsApp ──────────────────────────────────────────────

function WhatsAppPreview({ texto, formato, labels }: { texto: string; formato: Formato; labels: string[] }) {
  const linhas = texto.split("\n").map((l, i) => (
    <span key={i} className="block">
      {l.split(/(\*[^*]+\*)/).map((s, j) =>
        s.startsWith("*") && s.endsWith("*")
          ? <strong key={j}>{s.slice(1, -1)}</strong>
          : s
      )}
    </span>
  ));

  const showButtons = formato !== "TEXTO" && labels.length > 0;

  return (
    <div className="bg-[#0b141a] rounded-xl p-4 min-w-[260px] max-w-xs">
      <div className="flex justify-end mb-2">
        <div className="bg-[#005c4b] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[220px] text-[13px] text-white leading-relaxed">
          {linhas}
        </div>
      </div>
      {showButtons && (
        <div className="mt-1 flex flex-col gap-1">
          {labels.slice(0, formato === "QUICK_REPLY" ? 3 : 10).map((l, i) => (
            <div key={i} className="bg-[#1f2c33] border border-[#2a3942] rounded-lg text-center text-[13px] text-[#00a884] py-2 px-3 font-medium">
              {l}
            </div>
          ))}
          {formato === "LISTA" && (
            <div className="bg-[#1f2c33] border border-[#2a3942] rounded-lg text-center text-[13px] text-[#00a884] py-2 px-3 font-medium flex items-center justify-center gap-1">
              <span>☰</span> Escolher
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── card de etapa ─────────────────────────────────────────────────────────

function EtapaCard({ etapa, onSalvo }: { etapa: EtapaConfig; onSalvo: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(etapa.corpo_texto);
  const [formato, setFormato] = useState<Formato>(etapa.formato);
  const [labels, setLabels] = useState<string[]>(etapa.labels_botoes);
  const [salvando, setSalvando] = useState(false);
  const [resetando, setResetando] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function inserirVariavel(v: string) {
    const el = textareaRef.current;
    if (!el) return;
    const inicio = el.selectionStart;
    const fim = el.selectionEnd;
    const novo = texto.slice(0, inicio) + v + texto.slice(fim);
    setTexto(novo);
    setTimeout(() => { el.selectionStart = el.selectionEnd = inicio + v.length; el.focus(); }, 0);
  }

  async function salvar() {
    setSalvando(true);
    try {
      await api.put(`/interactive-messages/${etapa.etapa}`, { corpo_texto: texto, formato, labels_botoes: labels });
      onSalvo();
    } catch { /* handled */ }
    finally { setSalvando(false); }
  }

  async function restaurar() {
    setResetando(true);
    try {
      await api.delete(`/interactive-messages/${etapa.etapa}`);
      onSalvo();
    } catch { /* handled */ }
    finally { setResetando(false); }
  }

  return (
    <div className="bg-ab-card border border-ab-border rounded-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-ab-hover/30 transition-colors"
        onClick={() => setAberto(!aberto)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-ab-text">{NOMES[etapa.etapa] ?? etapa.etapa}</span>
          {etapa.customizado && (
            <span className="text-xs bg-ab-accent/15 text-ab-accent px-2 py-0.5 rounded-full">customizado</span>
          )}
        </div>
        <svg className={`w-4 h-4 text-ab-muted transition-transform ${aberto ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {aberto && (
        <div className="border-t border-ab-border px-5 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Editor */}
          <div className="space-y-4">
            {/* Variáveis */}
            {etapa.variaveis_disponiveis.length > 0 && (
              <div>
                <p className="text-xs text-ab-muted mb-2">Variáveis disponíveis (clique para inserir):</p>
                <div className="flex flex-wrap gap-1.5">
                  {etapa.variaveis_disponiveis.map((v) => (
                    <button
                      key={v}
                      onClick={() => inserirVariavel(v)}
                      className="text-xs bg-ab-bg border border-ab-border rounded px-2 py-1 text-ab-accent hover:bg-ab-accent/10 transition-colors font-mono"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Texto */}
            <div>
              <label className="text-xs text-ab-muted block mb-1.5">Texto da mensagem</label>
              <textarea
                ref={textareaRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={5}
                className="w-full bg-ab-bg border border-ab-border rounded-input px-3 py-2 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent resize-none"
              />
            </div>

            {/* Formato */}
            <div>
              <label className="text-xs text-ab-muted block mb-1.5">Formato</label>
              <select
                value={formato}
                onChange={(e) => setFormato(e.target.value as Formato)}
                className="w-full bg-ab-bg border border-ab-border rounded-input px-3 py-2 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent"
              >
                {(Object.keys(FORMATO_LABELS) as Formato[]).map((f) => (
                  <option key={f} value={f}>{FORMATO_LABELS[f]}</option>
                ))}
              </select>
            </div>

            {/* Labels dos botões fixos */}
            {labels.length > 0 && formato !== "TEXTO" && (
              <div>
                <label className="text-xs text-ab-muted block mb-1.5">Labels dos botões</label>
                <div className="space-y-2">
                  {labels.map((l, i) => (
                    <input
                      key={i}
                      value={l}
                      maxLength={20}
                      onChange={(e) => {
                        const novo = [...labels];
                        novo[i] = e.target.value;
                        setLabels(novo);
                      }}
                      className="w-full bg-ab-bg border border-ab-border rounded-input px-3 py-2 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent"
                      placeholder={`Botão ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={salvar}
                disabled={salvando}
                className="flex-1 bg-ab-accent hover:bg-ab-accent/90 text-white text-sm font-medium py-2 rounded-input transition-colors disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar"}
              </button>
              {etapa.customizado && (
                <button
                  onClick={restaurar}
                  disabled={resetando}
                  className="text-sm text-ab-muted hover:text-ab-text px-3 py-2 border border-ab-border rounded-input transition-colors disabled:opacity-60"
                >
                  Restaurar padrão
                </button>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-ab-muted self-start">Preview</p>
            <WhatsAppPreview
              texto={texto}
              formato={formato}
              labels={formato !== "TEXTO" ? labels : []}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── seção de templates aprovados ──────────────────────────────────────────

const STATUS_BADGE: Record<StatusTemplate, string> = {
  pendente:  "bg-yellow-500/15 text-yellow-400",
  aprovado:  "bg-green-500/15 text-green-400",
  rejeitado: "bg-red-500/15 text-red-400",
};

function SecaoTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [sid, setSid] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    try {
      const r = await api.get<Template[]>("/whatsapp-templates");
      setTemplates(r.data);
    } catch { /* ignored */ }
  }

  useEffect(() => { carregar(); }, []);

  async function salvar(chave: string) {
    if (!/^HX[a-f0-9]{32}$/.test(sid)) {
      setErro("Content SID inválido. Deve começar com HX seguido de 32 caracteres hex.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      await api.post("/whatsapp-templates", { chave, content_sid: sid, status: "pendente" });
      setSid("");
      setEditando(null);
      carregar();
    } catch { setErro("Erro ao salvar."); }
    finally { setSalvando(false); }
  }

  const templatePorChave = (chave: string) => templates.find((t) => t.chave === chave);

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold text-ab-text mb-1">Templates WhatsApp (mensagens fora de sessão)</h2>
      <p className="text-sm text-ab-muted mb-4">
        Templates aprovados pela Meta são necessários para lembretes e notificações de fila enviados fora da janela de 24h.
        Crie os templates no <a href="https://console.twilio.com/us1/develop/sms/content-template-builder" target="_blank" rel="noreferrer" className="text-ab-accent hover:underline">Twilio Content Template Builder</a> e cole o Content SID aqui.
      </p>

      <div className="space-y-3">
        {CHAVES_TEMPLATE.map((chave) => {
          const tmpl = templatePorChave(chave);
          const emEdicao = editando === chave;

          return (
            <div key={chave} className="bg-ab-card border border-ab-border rounded-card p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium text-ab-text">{NOMES_TEMPLATE[chave]}</p>
                  <p className="text-xs text-ab-muted font-mono mt-0.5">{chave}</p>
                </div>
                <div className="flex items-center gap-2">
                  {tmpl ? (
                    <>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[tmpl.status]}`}>
                        {tmpl.status}
                      </span>
                      <span className="text-xs font-mono text-ab-muted">{tmpl.content_sid}</span>
                      <button
                        onClick={() => { setEditando(chave); setSid(tmpl.content_sid); setErro(""); }}
                        className="text-xs text-ab-accent hover:underline"
                      >
                        Editar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setEditando(chave); setSid(""); setErro(""); }}
                      className="text-sm text-ab-accent hover:underline"
                    >
                      + Configurar
                    </button>
                  )}
                </div>
              </div>

              {emEdicao && (
                <div className="mt-4 border-t border-ab-border pt-4 space-y-3">
                  <div>
                    <label className="text-xs text-ab-muted block mb-1.5">Content SID (HX...)</label>
                    <input
                      value={sid}
                      onChange={(e) => setSid(e.target.value.trim())}
                      placeholder="HX0000000000000000000000000000000000"
                      className="w-full bg-ab-bg border border-ab-border rounded-input px-3 py-2 text-sm font-mono text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent"
                    />
                    {erro && <p className="text-xs text-red-400 mt-1">{erro}</p>}
                  </div>
                  <p className="text-xs text-ab-muted">
                    Após salvar, marque o status como <strong>aprovado</strong> quando a Meta aprovar o template no Twilio Console.
                    Consulte <code className="bg-ab-bg px-1 rounded">TEMPLATES.md</code> para as variáveis e texto sugerido de cada template.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => salvar(chave)}
                      disabled={salvando}
                      className="bg-ab-accent hover:bg-ab-accent/90 text-white text-sm font-medium px-4 py-2 rounded-input transition-colors disabled:opacity-60"
                    >
                      {salvando ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      onClick={() => { setEditando(null); setErro(""); }}
                      className="text-sm text-ab-muted hover:text-ab-text px-3 py-2 border border-ab-border rounded-input transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── página principal ──────────────────────────────────────────────────────

export default function MensagensInterativas() {
  const [etapas, setEtapas] = useState<EtapaConfig[]>([]);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    try {
      const r = await api.get<EtapaConfig[]>("/interactive-messages");
      setEtapas(r.data);
    } catch { /* ignored */ }
    finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, []);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ab-text">Mensagens do Bot</h1>
        <p className="text-sm text-ab-muted mt-1">
          Personalize os textos e botões de cada etapa do fluxo de agendamento via WhatsApp.
        </p>
      </div>

      {carregando ? (
        <p className="text-sm text-ab-muted">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {etapas.map((e) => (
            <EtapaCard key={e.etapa} etapa={e} onSalvo={carregar} />
          ))}
        </div>
      )}

      <SecaoTemplates />
    </div>
  );
}
