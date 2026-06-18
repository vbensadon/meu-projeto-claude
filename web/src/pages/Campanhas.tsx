import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { api } from "../lib/api";
import type { Campanha, LogCampanha, SegmentoCampanha } from "../lib/types";

const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const SEGMENTOS: { value: SegmentoCampanha; label: string; descricao: string }[] = [
  { value: "todos", label: "Todos os clientes", descricao: "Todos os clientes cadastrados" },
  { value: "inativos_30", label: "Inativos 30+ dias", descricao: "Sem visita há mais de 30 dias" },
  { value: "inativos_60", label: "Inativos 60+ dias", descricao: "Sem visita há mais de 60 dias" },
  { value: "aniversariantes_mes", label: "Aniversariantes do mês", descricao: "Clientes com aniversário este mês" },
  { value: "vip", label: "Clientes VIP", descricao: "Mais de 10 visitas no último ano" },
];

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  enviando: "Enviando",
  concluida: "Concluída",
  falhou: "Falhou",
};

const STATUS_COR: Record<string, string> = {
  rascunho: "bg-ab-muted/20 text-ab-muted",
  agendada: "bg-blue-500/20 text-blue-400",
  enviando: "bg-yellow-500/20 text-yellow-400",
  concluida: "bg-green-500/20 text-green-400",
  falhou: "bg-ab-danger/20 text-ab-danger",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COR[status] ?? "bg-ab-muted/20 text-ab-muted"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Modal({ onClose, onCriada }: { onClose: () => void; onCriada: () => void }) {
  const [nome, setNome] = useState("");
  const [segmento, setSegmento] = useState<SegmentoCampanha>("todos");
  const [mensagem, setMensagem] = useState("");
  const [agendarEm, setAgendarEm] = useState("");
  const [totalPreview, setTotalPreview] = useState<number | null>(null);
  const [carregandoCount, setCarregandoCount] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const buscarCount = useCallback(async (seg: SegmentoCampanha) => {
    setCarregandoCount(true);
    setTotalPreview(null);
    try {
      const r = await api.get<{ total: number }>(`/campanhas/count?segmento=${seg}`);
      setTotalPreview(r.data.total);
    } catch { setTotalPreview(null); }
    finally { setCarregandoCount(false); }
  }, []);

  useEffect(() => { buscarCount(segmento); }, [segmento, buscarCount]);

  const enviar = async () => {
    if (!nome.trim() || !mensagem.trim()) { setErro("Preencha nome e mensagem."); return; }
    setEnviando(true); setErro("");
    try {
      await api.post("/campanhas", {
        nome: nome.trim(),
        segmento,
        mensagem: mensagem.trim(),
        agendado_para: agendarEm ? new Date(agendarEm).toISOString() : null,
      });
      onCriada();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.erro : "Erro ao criar campanha.";
      setErro(msg ?? "Erro ao criar campanha.");
    } finally { setEnviando(false); }
  };

  const preview = mensagem.replace(/\{nome\}/g, "João");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-ab-card border border-ab-border rounded-card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-ab-border">
          <h2 className="text-base font-semibold text-ab-text">Nova Campanha</h2>
          <button onClick={onClose} className="text-ab-muted hover:text-ab-text transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">Nome da campanha</label>
            <input
              className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all"
              placeholder="Ex: Promoção de Junho"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">Segmento</label>
            <div className="space-y-2">
              {SEGMENTOS.map((s) => (
                <label key={s.value} className={`flex items-start gap-3 p-3 rounded-input border cursor-pointer transition-all ${segmento === s.value ? "border-ab-accent bg-ab-accent/10" : "border-ab-border hover:border-ab-accent/50"}`}>
                  <input type="radio" className="mt-0.5 accent-ab-accent" value={s.value} checked={segmento === s.value} onChange={() => setSegmento(s.value)} />
                  <div>
                    <p className="text-sm font-medium text-ab-text">{s.label}</p>
                    <p className="text-xs text-ab-muted">{s.descricao}</p>
                  </div>
                </label>
              ))}
            </div>
            {totalPreview !== null && (
              <p className="mt-2 text-xs text-ab-accent font-medium">
                {carregandoCount ? "Calculando..." : `Esta campanha atingirá ${totalPreview} cliente${totalPreview !== 1 ? "s" : ""}`}
              </p>
            )}
            {carregandoCount && totalPreview === null && <p className="mt-2 text-xs text-ab-muted">Calculando destinatários...</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">Mensagem <span className="text-ab-muted/60">(use {"{nome}"} para personalizar)</span></label>
            <textarea
              className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all min-h-[100px] resize-none"
              placeholder="Olá {nome}, temos uma promoção especial para você!"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
            />
            {mensagem && (
              <div className="mt-2 p-3 bg-ab-bg rounded-input border border-ab-border/60">
                <p className="text-xs text-ab-muted mb-1">Prévia:</p>
                <p className="text-xs text-ab-text whitespace-pre-wrap">{preview}</p>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">
              Agendar envio <span className="text-ab-muted/60">(opcional — deixe vazio para enviar agora)</span>
            </label>
            <input
              type="datetime-local"
              className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all"
              value={agendarEm}
              onChange={(e) => setAgendarEm(e.target.value)}
            />
          </div>

          {erro && <p className="text-xs text-ab-danger">{erro}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-ab-border">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-ab-muted border border-ab-border rounded-input hover:bg-ab-hover transition-colors">
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={enviando || !nome.trim() || !mensagem.trim()}
            className="flex-1 px-4 py-2.5 text-sm bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all"
          >
            {enviando ? "Criando..." : agendarEm ? "Agendar campanha" : "Enviar agora"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DrawerLogs({ campanha, onClose }: { campanha: Campanha; onClose: () => void }) {
  const [logs, setLogs] = useState<LogCampanha[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api.get<{ logs: LogCampanha[] }>(`/campanhas/${campanha.id}/logs`)
      .then((r) => setLogs(r.data.logs))
      .catch(() => setLogs([]))
      .finally(() => setCarregando(false));
  }, [campanha.id]);

  const enviados = logs.filter((l) => l.status === "enviado").length;
  const falhas = logs.filter((l) => l.status === "falhou").length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-ab-card border-l border-ab-border flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-ab-border">
          <div>
            <h2 className="text-base font-semibold text-ab-text">{campanha.nome}</h2>
            <p className="text-xs text-ab-muted mt-0.5">{logs.length} envios</p>
          </div>
          <button onClick={onClose} className="text-ab-muted hover:text-ab-text transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!carregando && logs.length > 0 && (
          <div className="flex gap-4 px-5 py-3 border-b border-ab-border">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs text-ab-text">{enviados} enviados</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-ab-danger" />
              <span className="text-xs text-ab-text">{falhas} falhas</span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {carregando && <p className="text-sm text-ab-muted text-center py-8">Carregando...</p>}
          {!carregando && logs.length === 0 && <p className="text-sm text-ab-muted text-center py-8">Nenhum envio registrado.</p>}
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 p-3 rounded-input border border-ab-border bg-ab-bg">
              <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${log.status === "enviado" ? "bg-green-400" : "bg-ab-danger"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ab-text truncate">{log.cliente?.nome ?? "—"}</p>
                <p className="text-xs text-ab-muted truncate">{log.cliente?.telefone ?? "—"}</p>
                {log.erro && <p className="text-xs text-ab-danger mt-0.5 break-words">{log.erro}</p>}
              </div>
              <p className="text-xs text-ab-muted shrink-0">
                {fmtDataHora(log.enviado_em).slice(0, 11)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Campanhas() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [campanhaLogs, setCampanhaLogs] = useState<Campanha | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    api.get<{ campanhas: Campanha[] }>("/campanhas")
      .then((r) => setCampanhas(r.data.campanhas))
      .catch(() => setCampanhas([]))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const handleCriada = () => { setModalAberto(false); carregar(); };

  const dispararCampanha = async (id: string) => {
    try {
      await api.post(`/campanhas/${id}/enviar`);
      carregar();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.erro : "Erro ao disparar.";
      alert(msg ?? "Erro ao disparar campanha.");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ab-text">Campanhas</h1>
          <p className="text-sm text-ab-muted mt-0.5">Envie mensagens em massa pelo WhatsApp</p>
        </div>
        <button
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nova campanha
        </button>
      </div>

      {carregando ? (
        <div className="text-center py-20">
          <p className="text-ab-muted">Carregando...</p>
        </div>
      ) : campanhas.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <div className="w-16 h-16 rounded-full bg-ab-hover flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-ab-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </div>
          <p className="text-ab-text font-medium">Nenhuma campanha criada</p>
          <p className="text-sm text-ab-muted">Crie sua primeira campanha para enviar mensagens em massa.</p>
          <button
            onClick={() => setModalAberto(true)}
            className="mt-2 px-4 py-2 text-sm bg-ab-accent/20 text-ab-accent rounded-input hover:bg-ab-accent/30 transition-colors font-medium"
          >
            Criar campanha
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campanhas.map((c) => {
            const total = c.total_enviados + c.total_falhas;
            const progresso = total > 0 ? Math.round((c.total_enviados / total) * 100) : 0;
            const segLabel = SEGMENTOS.find((s) => s.value === c.segmento)?.label ?? c.segmento;

            return (
              <div key={c.id} className="bg-ab-card border border-ab-border rounded-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-ab-text">{c.nome}</h3>
                      <Badge status={c.status} />
                    </div>
                    <p className="text-xs text-ab-muted mt-1">{segLabel}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {(c.status === "concluida" || c.status === "enviando") && (
                      <button
                        onClick={() => setCampanhaLogs(c)}
                        className="text-xs px-3 py-1.5 border border-ab-border rounded-input text-ab-muted hover:text-ab-text hover:border-ab-accent transition-all"
                      >
                        Ver logs
                      </button>
                    )}
                    {(c.status === "rascunho" || c.status === "agendada") && (
                      <button
                        onClick={() => dispararCampanha(c.id)}
                        className="text-xs px-3 py-1.5 bg-ab-accent/20 text-ab-accent rounded-input hover:bg-ab-accent/30 transition-colors font-medium"
                      >
                        Enviar agora
                      </button>
                    )}
                  </div>
                </div>

                {(c.status === "concluida" || c.status === "enviando" || c.status === "falhou") && total > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-ab-muted mb-1.5">
                      <span>{c.total_enviados} enviados · {c.total_falhas} falhas</span>
                      {c.status === "concluida" && <span>{progresso}% sucesso</span>}
                    </div>
                    <div className="h-1.5 bg-ab-bg rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-ab-accent to-ab-teal rounded-full transition-all duration-500"
                        style={{ width: `${progresso}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 mt-3 text-xs text-ab-muted">
                  <span>Criada em {fmtData(c.created_at)}</span>
                  {c.agendado_para && c.status === "agendada" && (
                    <span>Agendada para {fmtDataHora(c.agendado_para)}</span>
                  )}
                  {c.enviado_em && (
                    <span>Enviada em {fmtDataHora(c.enviado_em)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalAberto && <Modal onClose={() => setModalAberto(false)} onCriada={handleCriada} />}
      {campanhaLogs && <DrawerLogs campanha={campanhaLogs} onClose={() => setCampanhaLogs(null)} />}
    </div>
  );
}
