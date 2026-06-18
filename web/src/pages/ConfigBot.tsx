import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../lib/api";
import type { ConfigBot, HorarioBot, Servico } from "../lib/types";

type Aba = "mensagens" | "horarios" | "servicos";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CAMPOS_MENSAGEM: { key: keyof ConfigBot; label: string; hint: string }[] = [
  { key: "msg_boas_vindas",   label: "Boas-vindas",       hint: "Primeira mensagem recebida pelo cliente" },
  { key: "msg_confirmacao",   label: "Confirmação",        hint: "Enviada ao confirmar agendamento. Vars: {clientName}, {date}, {time}, {serviceName}, {barberName}" },
  { key: "msg_cancelamento",  label: "Cancelamento",       hint: "Enviada ao cancelar. Vars: {clientName}, {serviceName}, {date}, {time}" },
  { key: "msg_fora_horario",  label: "Fora do horário",   hint: "Resposta automática fora do expediente" },
  { key: "msg_reagendamento", label: "Reagendamento",      hint: "Sugestão de reagendar" },
  { key: "msg_lista_espera",  label: "Lista de espera",   hint: "Quando não há horário disponível" },
];

// Componente de item arrastável para a lista de serviços
function ServicoItem({ servico }: { servico: Servico }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: servico.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 bg-ab-card border rounded-input px-4 py-3 select-none ${isDragging ? "border-ab-accent shadow-lg shadow-ab-accent/20 z-10" : "border-ab-border"}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-ab-muted hover:text-ab-text cursor-grab active:cursor-grabbing touch-none"
        aria-label="Arrastar para reordenar"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
        </svg>
      </button>
      <div className="flex-1">
        <p className="text-sm font-medium text-ab-text">{servico.nome}</p>
        <p className="text-xs text-ab-muted">{servico.duracao_minutos}min · R$ {Number(servico.preco).toFixed(2)}</p>
      </div>
      <span className="text-xs text-ab-muted/50 font-mono">#{servico.ordem + 1}</span>
    </div>
  );
}

export default function ConfigBot() {
  const [aba, setAba] = useState<Aba>("mensagens");

  // Mensagens
  const [config, setConfig] = useState<ConfigBot | null>(null);
  const [mensagens, setMensagens] = useState<Partial<ConfigBot>>({});
  const [salvandoMsg, setSalvandoMsg] = useState(false);
  const [msgFeedback, setMsgFeedback] = useState("");

  // Horários
  const [horarios, setHorarios] = useState<HorarioBot[]>([]);
  const [salvandoHor, setSalvandoHor] = useState(false);
  const [horFeedback, setHorFeedback] = useState("");

  // Serviços
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [salvandoSrv, setSalvandoSrv] = useState(false);
  const [srvFeedback, setSrvFeedback] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const carregar = useCallback(async () => {
    const [botRes, srvRes] = await Promise.all([
      api.get<{ config: ConfigBot; horarios: HorarioBot[] }>("/config-bot"),
      api.get<Servico[]>("/servicos"),
    ]);
    setConfig(botRes.data.config);
    setMensagens(botRes.data.config);
    setHorarios(botRes.data.horarios);
    const sorted = [...srvRes.data].sort((a, b) => a.ordem - b.ordem);
    setServicos(sorted);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarMensagens = async () => {
    setSalvandoMsg(true); setMsgFeedback("");
    try {
      await api.put("/config-bot/mensagens", mensagens);
      setMsgFeedback("Mensagens salvas com sucesso.");
    } catch { setMsgFeedback("Erro ao salvar mensagens."); }
    finally { setSalvandoMsg(false); }
  };

  const salvarHorarios = async () => {
    setSalvandoHor(true); setHorFeedback("");
    try {
      await api.put("/config-bot/horarios", horarios.map(({ dia_semana, ativo, hora_inicio, hora_fim }) => ({ dia_semana, ativo, hora_inicio, hora_fim })));
      setHorFeedback("Horários salvos com sucesso.");
    } catch { setHorFeedback("Erro ao salvar horários."); }
    finally { setSalvandoHor(false); }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = servicos.findIndex((s) => s.id === active.id);
    const newIdx = servicos.findIndex((s) => s.id === over.id);
    const reordenado = arrayMove(servicos, oldIdx, newIdx).map((s, i) => ({ ...s, ordem: i }));
    setServicos(reordenado);
  };

  const salvarOrdem = async () => {
    setSalvandoSrv(true); setSrvFeedback("");
    try {
      await api.put("/config-bot/servicos-ordem", servicos.map(({ id, ordem }) => ({ id, ordem })));
      setSrvFeedback("Ordem salva com sucesso.");
    } catch { setSrvFeedback("Erro ao salvar ordem."); }
    finally { setSalvandoSrv(false); }
  };

  const inputClass = "w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all";
  const ehErro = (m: string) => m.toLowerCase().includes("erro");

  const atualizarHorario = (idx: number, campo: keyof HorarioBot, valor: boolean | string) => {
    setHorarios((prev) => prev.map((h, i) => i === idx ? { ...h, [campo]: valor } : h));
  };

  if (!config) return <div className="p-8 text-center text-ab-muted">Carregando...</div>;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ab-text">Configuração do Bot</h1>
        <p className="text-sm text-ab-muted mt-0.5">Personalize as mensagens, horários e ordem dos serviços no chatbot</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-ab-card border border-ab-border rounded-card p-1">
        {(["mensagens", "horarios", "servicos"] as Aba[]).map((a) => (
          <button key={a} onClick={() => setAba(a)}
            className={`flex-1 text-sm py-2 rounded-input font-medium transition-all capitalize ${aba === a ? "bg-ab-accent/15 text-ab-accent" : "text-ab-muted hover:text-ab-text"}`}>
            {a === "mensagens" ? "Mensagens" : a === "horarios" ? "Horários" : "Serviços"}
          </button>
        ))}
      </div>

      {/* Aba Mensagens */}
      {aba === "mensagens" && (
        <div className="space-y-4">
          {CAMPOS_MENSAGEM.map(({ key, label, hint }) => (
            <section key={key} className="bg-ab-card border border-ab-border rounded-card p-4 space-y-2">
              <div>
                <label className="text-sm font-medium text-ab-text block">{label}</label>
                <p className="text-xs text-ab-muted">{hint}</p>
              </div>
              <textarea
                value={(mensagens[key] as string) ?? ""}
                onChange={(e) => setMensagens((prev) => ({ ...prev, [key]: e.target.value }))}
                rows={4}
                className={`${inputClass} resize-y font-mono text-xs min-h-[80px]`}
              />
            </section>
          ))}
          {msgFeedback && (
            <p className={`text-sm ${ehErro(msgFeedback) ? "text-ab-danger" : "text-ab-teal"}`}>{msgFeedback}</p>
          )}
          <button onClick={salvarMensagens} disabled={salvandoMsg}
            className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-5 py-2.5 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all">
            {salvandoMsg ? "Salvando..." : "Salvar mensagens"}
          </button>
        </div>
      )}

      {/* Aba Horários */}
      {aba === "horarios" && (
        <div className="space-y-4">
          <div className="bg-ab-card border border-ab-border rounded-card overflow-hidden">
            <div className="px-5 py-3 border-b border-ab-border">
              <p className="text-sm font-medium text-ab-text">Horário de funcionamento</p>
              <p className="text-xs text-ab-muted mt-0.5">O bot responde às mensagens apenas nesses horários</p>
            </div>
            <div className="divide-y divide-ab-border/50">
              {horarios.map((h, idx) => (
                <div key={h.dia_semana} className="flex items-center gap-4 px-5 py-3.5">
                  <button
                    onClick={() => atualizarHorario(idx, "ativo", !h.ativo)}
                    className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${h.ativo ? "bg-ab-accent" : "bg-ab-border"}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${h.ativo ? "left-5" : "left-0.5"}`} />
                  </button>
                  <span className={`text-sm font-medium w-8 ${h.ativo ? "text-ab-text" : "text-ab-muted"}`}>{DIAS[h.dia_semana]}</span>
                  {h.ativo ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input type="time" value={h.hora_inicio}
                        onChange={(e) => atualizarHorario(idx, "hora_inicio", e.target.value)}
                        className="bg-ab-bg border border-ab-border rounded-input px-3 py-1.5 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent" />
                      <span className="text-ab-muted text-sm">até</span>
                      <input type="time" value={h.hora_fim}
                        onChange={(e) => atualizarHorario(idx, "hora_fim", e.target.value)}
                        className="bg-ab-bg border border-ab-border rounded-input px-3 py-1.5 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent" />
                    </div>
                  ) : (
                    <span className="text-xs text-ab-muted/60 italic">Fechado</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {horFeedback && <p className={`text-sm ${ehErro(horFeedback) ? "text-ab-danger" : "text-ab-teal"}`}>{horFeedback}</p>}
          <button onClick={salvarHorarios} disabled={salvandoHor}
            className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-5 py-2.5 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all">
            {salvandoHor ? "Salvando..." : "Salvar horários"}
          </button>
        </div>
      )}

      {/* Aba Serviços */}
      {aba === "servicos" && (
        <div className="space-y-4">
          <div className="bg-ab-card border border-ab-border rounded-card p-4 space-y-2">
            <p className="text-sm font-medium text-ab-text">Ordem dos serviços no menu do bot</p>
            <p className="text-xs text-ab-muted">Arraste os serviços para definir a ordem em que aparecem para o cliente</p>
          </div>

          {servicos.length === 0 ? (
            <p className="text-center text-ab-muted py-8">Nenhum serviço cadastrado.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={servicos.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {servicos.map((s) => <ServicoItem key={s.id} servico={s} />)}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {srvFeedback && <p className={`text-sm ${ehErro(srvFeedback) ? "text-ab-danger" : "text-ab-teal"}`}>{srvFeedback}</p>}
          <button onClick={salvarOrdem} disabled={salvandoSrv || servicos.length === 0}
            className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-5 py-2.5 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all">
            {salvandoSrv ? "Salvando..." : "Salvar ordem"}
          </button>
        </div>
      )}
    </div>
  );
}
