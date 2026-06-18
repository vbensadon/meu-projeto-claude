import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../contexts/ThemeContext";
import BotaoExportar from "../components/BotaoExportar";
import type { Agendamento, Bloqueio, Profissional, Servico } from "../lib/types";

const HORAS = Array.from({ length: 24 }, (_, i) => i); // 00 - 23
const HORA_SCROLL_INICIAL = 7; // ao abrir, posiciona perto do horário comercial
const ALTURA_HORA = 64;
const SNAP_MINUTOS = 15;
const CORES_DARK = [
  "bg-ab-accent/20 border-ab-accent text-ab-accent",
  "bg-emerald-500/20 border-emerald-400 text-emerald-300",
  "bg-amber-500/20 border-amber-400 text-amber-300",
  "bg-rose-500/20 border-rose-400 text-rose-300",
  "bg-purple-500/20 border-purple-400 text-purple-300",
] as const;
const CORES_LIGHT = [
  "bg-ab-accent/15 border-ab-accent text-ab-accent",
  "bg-emerald-500/15 border-emerald-600 text-emerald-700",
  "bg-amber-500/15 border-amber-600 text-amber-700",
  "bg-rose-500/15 border-rose-600 text-rose-700",
  "bg-purple-500/15 border-purple-600 text-purple-700",
] as const;

function inicioSemana(ref: Date): Date {
  const d = new Date(ref);
  const dia = d.getDay(); // 0 = dom
  d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1)); // segunda
  d.setHours(0, 0, 0, 0);
  return d;
}

function diasDaSemana(inicio: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatarHora(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Deixa 2px de respiro entre cards vizinhos (mesmo quando um termina exatamente
// onde o outro começa), senão eles colam e parecem um único card quebrado.
const GAP_VERTICAL = 2;

function posicaoAgendamento(ag: Agendamento): { top: number; height: number } {
  const dt = new Date(ag.data_hora);
  const minutosDesdeMeiaNoite = dt.getHours() * 60 + dt.getMinutes();
  const topBruto = (minutosDesdeMeiaNoite / 60) * ALTURA_HORA;
  const alturaBruta = Math.max((ag.servico.duracao_minutos / 60) * ALTURA_HORA, 28);
  return { top: topBruto + GAP_VERTICAL / 2, height: alturaBruta - GAP_VERTICAL };
}

function posicaoBloqueio(b: Bloqueio): { top: number; height: number } {
  const inicio = new Date(b.inicio);
  const fim = new Date(b.fim);
  const minutosInicio = inicio.getHours() * 60 + inicio.getMinutes();
  const minutosFimBruto = fim.getHours() * 60 + fim.getMinutes();
  const ultrapassaODia = fim.getDate() !== inicio.getDate() || (minutosFimBruto === 0 && fim > inicio);
  const minutosFim = ultrapassaODia ? HORAS.length * 60 : minutosFimBruto;
  const top = (minutosInicio / 60) * ALTURA_HORA;
  const height = Math.max(((minutosFim - minutosInicio) / 60) * ALTURA_HORA, 8);
  return { top, height };
}

// Distribui agendamentos que se sobrepõem no tempo em "pistas" lado a lado,
// para nenhum cobrir o outro visualmente (ex: dois profissionais no mesmo horário).
function layoutDoDia(ags: Agendamento[]): Map<string, { lane: number; totalLanes: number }> {
  const eventos = ags
    .map((a) => {
      const inicio = new Date(a.data_hora).getTime();
      const fim = inicio + a.servico.duracao_minutos * 60_000;
      return { id: a.id, inicio, fim };
    })
    .sort((a, b) => a.inicio - b.inicio);

  const resultado = new Map<string, { lane: number; totalLanes: number }>();
  let cluster: { id: string; inicio: number; fim: number; lane: number }[] = [];
  let clusterFimMax = -Infinity;

  const finalizarCluster = () => {
    if (cluster.length === 0) return;
    const totalLanes = Math.max(...cluster.map((e) => e.lane)) + 1;
    cluster.forEach((e) => resultado.set(e.id, { lane: e.lane, totalLanes }));
    cluster = [];
  };

  for (const ev of eventos) {
    if (cluster.length > 0 && ev.inicio >= clusterFimMax) {
      finalizarCluster();
      clusterFimMax = -Infinity;
    }
    const lanesOcupadas = new Set(cluster.filter((e) => e.fim > ev.inicio).map((e) => e.lane));
    let lane = 0;
    while (lanesOcupadas.has(lane)) lane++;
    cluster.push({ ...ev, lane });
    clusterFimMax = Math.max(clusterFimMax, ev.fim);
  }
  finalizarCluster();

  return resultado;
}

function gerarSlotsBase(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

const campoClass =
  "w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200 disabled:opacity-50";

function ModalAgendar({
  profissionais,
  servicos,
  inicial,
  onFechar,
  onCriado,
}: {
  profissionais: Profissional[];
  servicos: Servico[];
  inicial?: { profissionalId: string; data: string; horario?: string };
  onFechar: () => void;
  onCriado: (ag: Agendamento) => void;
}) {
  const hojeISO = toISO(new Date());
  const [profissionalId, setProfissionalId] = useState(inicial?.profissionalId ?? "");
  const [servicoId, setServicoId] = useState("");
  const [data, setData] = useState(inicial?.data ?? hojeISO);
  const [horario, setHorario] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [horariosLivres, setHorariosLivres] = useState<string[]>([]);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const horarioPreSelecionado = useRef(inicial?.horario);

  const servico = servicos.find((s) => s.id === servicoId);

  useEffect(() => {
    setHorario("");
    if (!profissionalId || !servicoId || !data) { setHorariosLivres([]); return; }
    setCarregandoHorarios(true);
    api
      .get<Agendamento[]>(`/agendamentos?data=${data}&profissional_id=${profissionalId}`)
      .then((r) => {
        const duracao = servico?.duracao_minutos ?? 30;
        const ocupados = r.data
          .filter((a) => a.status !== "cancelado")
          .map((a) => {
            const inicio = new Date(a.data_hora);
            return { inicio, fim: new Date(inicio.getTime() + a.servico.duracao_minutos * 60_000) };
          });
        const livres = gerarSlotsBase().filter((h) => {
          const [hh, mm] = h.split(":").map(Number);
          const inicioSlot = new Date(`${data}T00:00:00`);
          inicioSlot.setHours(hh, mm, 0, 0);
          const fimSlot = new Date(inicioSlot.getTime() + duracao * 60_000);
          return ocupados.every((o) => fimSlot <= o.inicio || inicioSlot >= o.fim);
        });
        setHorariosLivres(livres);
        if (horarioPreSelecionado.current && livres.includes(horarioPreSelecionado.current)) {
          setHorario(horarioPreSelecionado.current);
          horarioPreSelecionado.current = undefined;
        }
      })
      .finally(() => setCarregandoHorarios(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profissionalId, servicoId, data]);

  const salvar = async () => {
    if (!profissionalId || !servicoId || !horario || !nome.trim() || !telefone.trim()) {
      setErro("Preencha todos os campos.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      const [hh, mm] = horario.split(":").map(Number);
      const dataHora = new Date(`${data}T00:00:00`);
      dataHora.setHours(hh, mm, 0, 0);

      const { data: criado } = await api.post<Agendamento>("/agendamentos", {
        profissional_id: profissionalId,
        servico_id: servicoId,
        cliente_nome: nome.trim(),
        cliente_telefone: telefone.trim(),
        data_hora: dataHora.toISOString(),
      });
      onCriado(criado);
      onFechar();
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        setErro("Esse horário já está ocupado. Escolha outro.");
      } else {
        setErro("Erro ao criar agendamento.");
      }
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onFechar}
    >
      <div
        className="bg-ab-card border border-ab-border rounded-card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ab-text mb-4">Novo agendamento</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-ab-muted block mb-1">Profissional</label>
            <select className={campoClass} value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
              <option value="">Selecione...</option>
              {profissionais.filter((p) => p.ativo).map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1">Serviço</label>
            <select className={campoClass} value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
              <option value="">Selecione...</option>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1">Data</label>
            <input type="date" className={campoClass} value={data} min={hojeISO}
              onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1">Horário</label>
            <select className={campoClass} value={horario} onChange={(e) => setHorario(e.target.value)}
              disabled={carregandoHorarios || horariosLivres.length === 0}>
              <option value="">
                {carregandoHorarios ? "Carregando..." : horariosLivres.length === 0 ? "Sem horários disponíveis" : "Selecione..."}
              </option>
              {horariosLivres.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1">Nome do cliente</label>
            <input className={campoClass} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1">Telefone do cliente</label>
            <input className={campoClass} placeholder="+5511999999999" value={telefone}
              onChange={(e) => setTelefone(e.target.value)} />
          </div>
        </div>

        {erro && <p className="text-ab-danger text-sm mt-3">{erro}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={salvar} disabled={salvando}
            className="flex-1 bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2.5 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200">
            {salvando ? "Salvando..." : "Confirmar"}
          </button>
          <button onClick={onFechar}
            className="px-4 py-2.5 rounded-input border border-ab-border text-ab-muted hover:bg-ab-hover hover:text-ab-text transition-all duration-200">
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ModalEditar({
  agendamento,
  profissionais,
  servicos,
  cancelando,
  marcandoStatus,
  onFechar,
  onSalvo,
  onCancelar,
  onMarcarStatus,
}: {
  agendamento: Agendamento;
  profissionais: Profissional[];
  servicos: Servico[];
  cancelando: boolean;
  marcandoStatus: boolean;
  onFechar: () => void;
  onSalvo: (ag: Agendamento) => void;
  onCancelar: () => void;
  onMarcarStatus: (status: "concluido" | "nao_compareceu" | "confirmado") => void;
}) {
  const dataOriginal = new Date(agendamento.data_hora);
  const [profissionalId, setProfissionalId] = useState(agendamento.profissional.id);
  const [servicoId, setServicoId] = useState(agendamento.servico.id);
  const [data, setData] = useState(toISO(dataOriginal));
  const [horario, setHorario] = useState(formatarHora(dataOriginal));
  const [nome, setNome] = useState(agendamento.cliente_nome);
  const [telefone, setTelefone] = useState(agendamento.cliente_telefone);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!profissionalId || !servicoId || !horario || !nome.trim() || !telefone.trim()) {
      setErro("Preencha todos os campos.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      const [hh, mm] = horario.split(":").map(Number);
      const dataHora = new Date(`${data}T00:00:00`);
      dataHora.setHours(hh, mm, 0, 0);

      const { data: atualizado } = await api.patch<Agendamento>(`/agendamentos/${agendamento.id}`, {
        profissional_id: profissionalId,
        servico_id: servicoId,
        cliente_nome: nome.trim(),
        cliente_telefone: telefone.trim(),
        data_hora: dataHora.toISOString(),
      });
      onSalvo(atualizado);
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        setErro("Esse horário já está ocupado. Escolha outro.");
      } else {
        setErro("Erro ao salvar alterações.");
      }
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onFechar}
    >
      <div
        className="bg-ab-card border border-ab-border rounded-card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ab-text mb-4">Editar agendamento</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-ab-muted block mb-1">Profissional</label>
            <select className={campoClass} value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
              {profissionais.filter((p) => p.ativo || p.id === agendamento.profissional.id).map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1">Serviço</label>
            <select className={campoClass} value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ab-muted block mb-1">Data</label>
              <input type="date" className={campoClass} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-ab-muted block mb-1">Horário</label>
              <input type="time" step={900} className={campoClass} value={horario}
                onChange={(e) => setHorario(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1">Nome do cliente</label>
            <input className={campoClass} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1">Telefone do cliente</label>
            <input className={campoClass} value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-ab-border">
          <label className="text-xs text-ab-muted block mb-2">Status do atendimento</label>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onMarcarStatus("concluido")}
              disabled={marcandoStatus || salvando || cancelando || agendamento.status === "concluido"}
              className={`text-xs px-3 py-1.5 rounded-chip border transition-all duration-200 disabled:opacity-60 ${
                agendamento.status === "concluido"
                  ? "bg-ab-teal border-ab-teal text-white"
                  : "border-ab-border text-ab-muted hover:bg-ab-hover hover:text-ab-text"
              }`}>
              ✓ Concluído
            </button>
            <button onClick={() => onMarcarStatus("nao_compareceu")}
              disabled={marcandoStatus || salvando || cancelando || agendamento.status === "nao_compareceu"}
              className={`text-xs px-3 py-1.5 rounded-chip border transition-all duration-200 disabled:opacity-60 ${
                agendamento.status === "nao_compareceu"
                  ? "bg-ab-danger border-ab-danger text-white"
                  : "border-ab-border text-ab-muted hover:bg-ab-hover hover:text-ab-text"
              }`}>
              Não compareceu
            </button>
            {(agendamento.status === "concluido" || agendamento.status === "nao_compareceu") && (
              <button onClick={() => onMarcarStatus("confirmado")} disabled={marcandoStatus || salvando || cancelando}
                className="text-xs px-3 py-1.5 rounded-chip border border-ab-border text-ab-muted hover:bg-ab-hover hover:text-ab-text transition-all duration-200 disabled:opacity-60">
                Reverter para confirmado
              </button>
            )}
          </div>
        </div>

        {erro && <p className="text-ab-danger text-sm mt-3">{erro}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={salvar} disabled={salvando || cancelando}
            className="flex-1 bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2.5 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200">
            {salvando ? "Salvando..." : "Salvar alterações"}
          </button>
          <button onClick={onFechar} disabled={salvando || cancelando}
            className="px-4 py-2.5 rounded-input border border-ab-border text-ab-muted hover:bg-ab-hover hover:text-ab-text transition-all duration-200 disabled:opacity-50">
            Fechar
          </button>
        </div>

        <button onClick={onCancelar} disabled={salvando || cancelando}
          className="w-full text-center text-xs text-ab-danger/70 hover:text-ab-danger mt-4 pt-3 border-t border-ab-border transition-all duration-150 disabled:opacity-50">
          {cancelando ? "Cancelando..." : "Cancelar este agendamento"}
        </button>
      </div>
    </div>,
    document.body
  );
}

const RECORRENCIA_LABEL: Record<string, string> = {
  diario: "Diário",
  semanal: "Semanal",
};

function DrawerBloqueios({
  profissionais,
  onFechar,
  onAlterado,
}: {
  profissionais: Profissional[];
  onFechar: () => void;
  onAlterado: () => void;
}) {
  const profissionaisAtivos = profissionais.filter((p) => p.ativo);
  const hojeISO = toISO(new Date());
  const [profissionalId, setProfissionalId] = useState(profissionaisAtivos[0]?.id ?? "");
  const [titulo, setTitulo] = useState("");
  const [dataInicio, setDataInicio] = useState(hojeISO);
  const [horaInicio, setHoraInicio] = useState("12:00");
  const [dataFim, setDataFim] = useState(hojeISO);
  const [horaFim, setHoraFim] = useState("13:00");
  const [recorrencia, setRecorrencia] = useState<"unico" | "diario" | "semanal">("unico");
  const [lista, setLista] = useState<Bloqueio[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregarLista = (profId: string) => {
    if (!profId) { setLista([]); return; }
    setCarregando(true);
    api
      .get<Bloqueio[]>(`/bloqueios?profissional_id=${profId}`)
      .then((r) => setLista(r.data))
      .finally(() => setCarregando(false));
  };

  useEffect(() => {
    carregarLista(profissionalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profissionalId]);

  const criar = async () => {
    if (!profissionalId || !titulo.trim() || !dataInicio || !horaInicio || !dataFim || !horaFim) {
      setErro("Preencha todos os campos.");
      return;
    }
    const inicio = new Date(`${dataInicio}T${horaInicio}:00`);
    const fim = new Date(`${dataFim}T${horaFim}:00`);
    if (fim <= inicio) {
      setErro("O fim deve ser depois do início.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      await api.post("/bloqueios", {
        profissional_id: profissionalId,
        titulo: titulo.trim(),
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        ...(recorrencia !== "unico" && { recorrencia }),
      });
      setTitulo("");
      carregarLista(profissionalId);
      onAlterado();
    } catch {
      setErro("Erro ao criar bloqueio.");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (id: string) => {
    if (!confirm("Remover este bloqueio? Se for recorrente, as próximas ocorrências também serão removidas.")) return;
    try {
      await api.delete(`/bloqueios/${id}`);
      carregarLista(profissionalId);
      onAlterado();
    } catch {
      alert("Erro ao remover bloqueio.");
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-end z-50" onClick={onFechar}>
      <div
        className="bg-ab-card border-l border-ab-border w-full max-w-md h-full p-6 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-ab-text">Bloqueios de agenda</h2>
          <button onClick={onFechar} className="text-ab-muted hover:text-ab-text transition-all duration-200">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-ab-muted block mb-1">Profissional</label>
            <select className={campoClass} value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
              {profissionaisAtivos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1">Título</label>
            <input className={campoClass} placeholder="Almoço, folga, férias..." value={titulo}
              onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ab-muted block mb-1">Data início</label>
              <input type="date" className={campoClass} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-ab-muted block mb-1">Hora início</label>
              <input type="time" className={campoClass} value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-ab-muted block mb-1">Data fim</label>
              <input type="date" className={campoClass} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-ab-muted block mb-1">Hora fim</label>
              <input type="time" className={campoClass} value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1">Recorrência</label>
            <select className={campoClass} value={recorrencia}
              onChange={(e) => setRecorrencia(e.target.value as "unico" | "diario" | "semanal")}>
              <option value="unico">Único</option>
              <option value="diario">Diário (próximos 90 dias)</option>
              <option value="semanal">Semanal (próximos 90 dias)</option>
            </select>
          </div>
        </div>

        {erro && <p className="text-ab-danger text-sm mt-3">{erro}</p>}

        <button onClick={criar} disabled={salvando}
          className="w-full mt-4 bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2.5 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200">
          {salvando ? "Salvando..." : "Criar bloqueio"}
        </button>

        <div className="mt-6 pt-4 border-t border-ab-border">
          <h3 className="text-sm font-semibold text-ab-text mb-2">Bloqueios ativos</h3>
          {carregando ? (
            <p className="text-xs text-ab-muted">Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="text-xs text-ab-muted">Nenhum bloqueio ativo para este profissional.</p>
          ) : (
            <ul className="space-y-2">
              {lista.map((b) => (
                <li key={b.id}
                  className="flex items-center justify-between gap-2 bg-ab-bg border border-ab-border rounded-input px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ab-text truncate">{b.titulo}</p>
                    <p className="text-xs text-ab-muted">
                      {new Date(b.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(b.fim).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {b.recorrencia && ` · ${RECORRENCIA_LABEL[b.recorrencia]}`}
                    </p>
                  </div>
                  <button onClick={() => remover(b.id)}
                    className="text-xs text-ab-danger/70 hover:text-ab-danger whitespace-nowrap transition-all duration-200">
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

const POLLING_DIA_MS = 30_000;

export default function Agenda() {
  const { resolvedTheme } = useTheme();
  const CORES = resolvedTheme === "dark" ? CORES_DARK : CORES_LIGHT;
  const { podeAcessar } = useAuth();
  const [modo, setModo] = useState<"semana" | "dia">("semana");
  const [semanaInicio, setSemanaInicio] = useState(() => inicioSemana(new Date()));
  const [diaSelecionado, setDiaSelecionado] = useState(() => new Date());
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [marcandoStatus, setMarcandoStatus] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [filtroProf, setFiltroProf] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [agendarInicial, setAgendarInicial] = useState<{ profissionalId: string; data: string; horario?: string } | null>(null);
  const [agendamentoEditando, setAgendamentoEditando] = useState<Agendamento | null>(null);
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  const [bloqueiosVersao, setBloqueiosVersao] = useState(0);
  const [drawerBloqueiosAberto, setDrawerBloqueiosAberto] = useState(false);

  const dias = diasDaSemana(semanaInicio);
  const gradeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gradeRef.current?.scrollTo({ top: HORA_SCROLL_INICIAL * ALTURA_HORA });
  }, [modo]);

  useEffect(() => {
    api.get<Profissional[]>("/profissionais").then((r) => setProfissionais(r.data));
    api.get<Servico[]>("/servicos").then((r) => setServicos(r.data));
  }, []);

  useEffect(() => {
    const carregar = () => {
      if (modo === "semana") {
        const diasDaJanela = diasDaSemana(semanaInicio);
        return Promise.all(
          diasDaJanela.map((d) => api.get<Agendamento[]>(`/agendamentos?data=${toISO(d)}`))
        ).then((resultados) => setAgendamentos(resultados.flatMap((r) => r.data)));
      }
      return api.get<Agendamento[]>(`/agendamentos?data=${toISO(diaSelecionado)}`).then((r) => setAgendamentos(r.data));
    };
    carregar();
    if (modo === "dia") {
      const intervalId = window.setInterval(carregar, POLLING_DIA_MS);
      return () => window.clearInterval(intervalId);
    }
  }, [modo, semanaInicio, diaSelecionado]);

  useEffect(() => {
    if (modo !== "dia") return;
    const dataISO = toISO(diaSelecionado);
    api
      .get<Bloqueio[]>(`/bloqueios?data_inicio=${dataISO}&data_fim=${dataISO}`)
      .then((r) => setBloqueios(r.data));
  }, [modo, diaSelecionado, bloqueiosVersao]);

  const semanaAnterior = () => {
    const d = new Date(semanaInicio);
    d.setDate(d.getDate() - 7);
    setSemanaInicio(d);
  };
  const proximaSemana = () => {
    const d = new Date(semanaInicio);
    d.setDate(d.getDate() + 7);
    setSemanaInicio(d);
  };
  const irParaHoje = () => setSemanaInicio(inicioSemana(new Date()));

  const diaAnterior = () => {
    const d = new Date(diaSelecionado);
    d.setDate(d.getDate() - 1);
    setDiaSelecionado(d);
  };
  const diaSeguinte = () => {
    const d = new Date(diaSelecionado);
    d.setDate(d.getDate() + 1);
    setDiaSelecionado(d);
  };
  const irParaHojeDia = () => setDiaSelecionado(new Date());

  const cancelar = async (id: string): Promise<boolean> => {
    if (!confirm("Cancelar este agendamento?")) return false;
    setCancelando(id);
    try {
      await api.patch(`/agendamentos/${id}/cancelar`);
      setAgendamentos((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "cancelado" as const } : a))
      );
      return true;
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 400) {
        alert((e.response.data as { erro?: string })?.erro ?? "Não é possível cancelar este agendamento.");
      } else {
        alert("Erro ao cancelar agendamento. Tente novamente.");
      }
      return false;
    } finally {
      setCancelando(null);
    }
  };

  const marcarStatus = async (id: string, status: "concluido" | "nao_compareceu" | "confirmado") => {
    setMarcandoStatus(id);
    try {
      const { data: atualizado } = await api.patch<Agendamento>(`/agendamentos/${id}/status`, { status });
      setAgendamentos((prev) => prev.map((a) => (a.id === id ? atualizado : a)));
      setAgendamentoEditando(atualizado);
    } catch {
      alert("Erro ao atualizar status do agendamento.");
    } finally {
      setMarcandoStatus(null);
    }
  };

  const moverAgendamento = async (id: string, novaDataHora: Date, novoProfissionalId?: string) => {
    const anterior = agendamentos.find((a) => a.id === id);
    if (!anterior) return;
    const novoProfissional = novoProfissionalId
      ? profissionais.find((p) => p.id === novoProfissionalId)
      : undefined;
    setAgendamentos((prev) =>
      prev.map((a) => (a.id === id ? {
        ...a,
        data_hora: novaDataHora.toISOString(),
        ...(novoProfissional && { profissional: { id: novoProfissional.id, nome: novoProfissional.nome } }),
      } : a))
    );
    try {
      const { data: atualizado } = await api.patch<Agendamento>(`/agendamentos/${id}`, {
        data_hora: novaDataHora.toISOString(),
        ...(novoProfissionalId && { profissional_id: novoProfissionalId }),
      });
      setAgendamentos((prev) => prev.map((a) => (a.id === id ? atualizado : a)));
    } catch (e) {
      setAgendamentos((prev) => prev.map((a) => (a.id === id ? anterior : a)));
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        alert("Horário indisponível para mover o agendamento.");
      } else {
        alert("Erro ao mover agendamento.");
      }
    }
  };

  const minutosDoDrop = (e: DragEvent<HTMLDivElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutosBrutos = (offsetY / ALTURA_HORA) * 60;
    return Math.min(
      HORAS.length * 60 - SNAP_MINUTOS,
      Math.max(0, Math.round(minutosBrutos / SNAP_MINUTOS) * SNAP_MINUTOS)
    );
  };

  const onDropDia = (e: DragEvent<HTMLDivElement>, dia: Date) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const minutosTotais = minutosDoDrop(e);
    const hora = Math.floor(minutosTotais / 60);
    const minuto = minutosTotais % 60;
    const novaDataHora = new Date(dia);
    novaDataHora.setHours(hora, minuto, 0, 0);
    moverAgendamento(id, novaDataHora);
  };

  const onDropProfissional = (e: DragEvent<HTMLDivElement>, profissionalId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const minutosTotais = minutosDoDrop(e);
    const hora = Math.floor(minutosTotais / 60);
    const minuto = minutosTotais % 60;
    const novaDataHora = new Date(diaSelecionado);
    novaDataHora.setHours(hora, minuto, 0, 0);
    moverAgendamento(id, novaDataHora, profissionalId);
  };

  const abrirCriacaoNoSlot = (e: MouseEvent<HTMLDivElement>, profissionalId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutosBrutos = (offsetY / ALTURA_HORA) * 60;
    const minutosTotais = Math.min(
      HORAS.length * 60 - SNAP_MINUTOS,
      Math.max(0, Math.round(minutosBrutos / SNAP_MINUTOS) * SNAP_MINUTOS)
    );
    const hora = String(Math.floor(minutosTotais / 60)).padStart(2, "0");
    const minuto = String(minutosTotais % 60).padStart(2, "0");
    setAgendarInicial({ profissionalId, data: toISO(diaSelecionado), horario: `${hora}:${minuto}` });
    setModalAberto(true);
  };

  const agendamentosFiltrados = agendamentos.filter(
    (a) => !filtroProf || a.profissional.id === filtroProf
  );

  const porDia = (data: Date) =>
    agendamentosFiltrados.filter((a) => {
      const d = new Date(a.data_hora);
      return (
        d.getFullYear() === data.getFullYear() &&
        d.getMonth() === data.getMonth() &&
        d.getDate() === data.getDate()
      );
    });

  const colunasProfissionais = profissionais.filter(
    (p) => p.ativo && (!filtroProf || p.id === filtroProf)
  );

  const porDiaProfissional = (profissionalId: string) =>
    agendamentos.filter((a) => a.profissional.id === profissionalId);

  const bloqueiosDoDiaProfissional = (profissionalId: string) =>
    bloqueios.filter((b) => b.profissional.id === profissionalId);

  const hoje = new Date();
  const nomeDias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  const corProfissional = (id: string) => {
    const idx = profissionais.findIndex((p) => p.id === id);
    return CORES[(idx < 0 ? 0 : idx) % CORES.length];
  };

  return (
    <div className="p-3 sm:p-4 h-full flex flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 sm:gap-3 mb-4 flex-wrap">
        <button onClick={modo === "semana" ? semanaAnterior : diaAnterior}
          className="p-1.5 rounded-input border border-ab-border hover:bg-ab-hover text-ab-muted hover:text-ab-text transition-all duration-200">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={modo === "semana" ? proximaSemana : diaSeguinte}
          className="p-1.5 rounded-input border border-ab-border hover:bg-ab-hover text-ab-muted hover:text-ab-text transition-all duration-200">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button onClick={modo === "semana" ? irParaHoje : irParaHojeDia}
          className="text-sm px-3 py-1.5 rounded-input border border-ab-border hover:bg-ab-hover text-ab-muted hover:text-ab-text transition-all duration-200">
          Hoje
        </button>
        {modo === "dia" && (
          <input type="date" value={toISO(diaSelecionado)}
            onChange={(e) => e.target.value && setDiaSelecionado(new Date(`${e.target.value}T00:00:00`))}
            className="text-sm px-2.5 py-1.5 rounded-input border border-ab-border bg-ab-bg text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent" />
        )}
        <h1 className="text-sm sm:text-lg font-bold text-ab-text flex-1 min-w-[140px] order-last sm:order-none basis-full sm:basis-auto">
          {modo === "semana"
            ? <>{dias[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })} –{" "}
                {dias[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</>
            : diaSelecionado.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </h1>
        <div className="flex items-center rounded-input border border-ab-border overflow-hidden text-xs">
          <button onClick={() => setModo("semana")}
            className={`px-3 py-1.5 transition-all duration-200 ${modo === "semana" ? "bg-ab-accent text-white" : "text-ab-muted hover:bg-ab-hover hover:text-ab-text"}`}>
            Semana
          </button>
          <button onClick={() => setModo("dia")}
            className={`px-3 py-1.5 transition-all duration-200 ${modo === "dia" ? "bg-ab-accent text-white" : "text-ab-muted hover:bg-ab-hover hover:text-ab-text"}`}>
            Dia
          </button>
        </div>
        <button onClick={() => setDrawerBloqueiosAberto(true)}
          className="ml-auto sm:ml-0 px-4 py-2 rounded-input border border-ab-border text-sm text-ab-muted hover:bg-ab-hover hover:text-ab-text transition-all duration-200 whitespace-nowrap">
          Bloqueios
        </button>
        {podeAcessar("dono", "gerente") && (
          <BotaoExportar
            urlBase="/relatorios/agendamentos"
            params={{
              data_inicio: toISO(modo === "semana" ? semanaInicio : diaSelecionado),
              data_fim: toISO(modo === "semana" ? dias[6] : diaSelecionado),
            }}
            nomeBase={`agendamentos_${toISO(modo === "semana" ? semanaInicio : diaSelecionado)}`}
          />
        )}
        <button onClick={() => { setAgendarInicial(null); setModalAberto(true); }}
          className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 transition-all duration-200 whitespace-nowrap">
          + Agendar
        </button>
      </div>

      {/* Filtro de profissional */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => setFiltroProf(null)}
          className={`text-xs px-3 py-1.5 rounded-chip border transition-all duration-200 whitespace-nowrap ${
            filtroProf === null
              ? "bg-ab-accent border-ab-accent text-white"
              : "border-ab-border text-ab-muted hover:bg-ab-hover hover:text-ab-text"
          }`}
        >
          Todos
        </button>
        {profissionais.filter((p) => p.ativo).map((p) => {
          const ativo = filtroProf === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setFiltroProf(p.id)}
              className={`text-xs px-3 py-1.5 rounded-chip border transition-all duration-200 whitespace-nowrap ${corProfissional(p.id)} ${
                filtroProf && !ativo ? "opacity-40" : ""
              }`}
            >
              {p.nome}
            </button>
          );
        })}
      </div>

      {/* Grade */}
      <div ref={gradeRef} className="flex-1 overflow-auto border border-ab-border rounded-card bg-ab-bg">
        {modo === "semana" ? (
        <div className="min-w-[700px]">
          {/* Cabeçalho dos dias */}
          <div className="grid grid-cols-[48px_repeat(7,1fr)] sticky top-0 z-10">
            <div className="border-b border-ab-border bg-ab-card" />
            {dias.map((d, i) => {
              const ehHoje =
                d.getDate() === hoje.getDate() &&
                d.getMonth() === hoje.getMonth() &&
                d.getFullYear() === hoje.getFullYear();
              return (
                <div key={i}
                  className={`border-b border-l border-ab-border px-2 py-2 text-center ${ehHoje ? "bg-ab-accent/10" : "bg-ab-card"}`}>
                  <p className="text-xs text-ab-muted">{nomeDias[i]}</p>
                  <p className={`text-sm font-semibold ${ehHoje ? "text-ab-accent" : "text-ab-text"}`}>
                    {d.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Corpo: coluna de horas + colunas dos dias */}
          <div className="grid grid-cols-[48px_repeat(7,1fr)]">
            <div>
              {HORAS.map((h) => (
                <div key={h}
                  className="border-b border-ab-border/50 flex items-start justify-end pr-2 pt-1"
                  style={{ height: ALTURA_HORA }}>
                  <span className="text-xs text-ab-muted/50">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>

            {dias.map((d, i) => {
              const ags = porDia(d);
              const layout = layoutDoDia(ags);
              return (
                <div key={i}
                  className="relative border-l border-ab-border/30"
                  style={{ height: HORAS.length * ALTURA_HORA }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropDia(e, d)}>
                  {HORAS.map((h, hi) => (
                    <div key={h}
                      className="absolute left-0 right-0 border-b border-ab-border/30 pointer-events-none"
                      style={{ top: hi * ALTURA_HORA, height: ALTURA_HORA }} />
                  ))}

                  {ags.map((ag) => {
                    const { top, height } = posicaoAgendamento(ag);
                    const { lane, totalLanes } = layout.get(ag.id) ?? { lane: 0, totalLanes: 1 };
                    const larguraPct = 100 / totalLanes;
                    const cor = corProfissional(ag.profissional.id);
                    const isCancelado = ag.status === "cancelado";
                    return (
                      <div key={ag.id}
                        draggable={!isCancelado}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", ag.id);
                          setArrastando(ag.id);
                        }}
                        onDragEnd={() => setArrastando(null)}
                        onClick={() => !isCancelado && setAgendamentoEditando(ag)}
                        title={isCancelado ? undefined : "Clique para editar"}
                        style={{
                          top,
                          height,
                          left: `calc(${lane * larguraPct}% + 2px)`,
                          width: `calc(${larguraPct}% - 4px)`,
                        }}
                        className={`absolute border-l-3 rounded px-1.5 py-0.5 text-xs overflow-hidden transition-opacity duration-200 ring-1 ring-black/30
                          ${isCancelado ? "opacity-30 line-through" : `${cor} cursor-grab active:cursor-grabbing hover:brightness-125`}
                          ${arrastando === ag.id ? "opacity-40" : ""}`}>
                        <p className="font-medium leading-tight truncate">{ag.cliente_nome}</p>
                        <p className="truncate opacity-75">{ag.servico.nome}</p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        ) : colunasProfissionais.length === 0 ? (
          <p className="p-6 text-sm text-ab-muted">Nenhum profissional ativo encontrado.</p>
        ) : (
        <div style={{ minWidth: `${48 + colunasProfissionais.length * 160}px` }}>
          {/* Cabeçalho dos profissionais */}
          <div className="grid sticky top-0 z-10"
            style={{ gridTemplateColumns: `48px repeat(${colunasProfissionais.length}, minmax(160px, 1fr))` }}>
            <div className="border-b border-ab-border bg-ab-card" />
            {colunasProfissionais.map((p) => (
              <div key={p.id} className="border-b border-l border-ab-border px-2 py-2 text-center bg-ab-card">
                <p className="text-sm font-semibold text-ab-text truncate">{p.nome}</p>
              </div>
            ))}
          </div>

          {/* Corpo: coluna de horas + colunas dos profissionais */}
          <div className="grid" style={{ gridTemplateColumns: `48px repeat(${colunasProfissionais.length}, minmax(160px, 1fr))` }}>
            <div>
              {HORAS.map((h) => (
                <div key={h}
                  className="border-b border-ab-border/50 flex items-start justify-end pr-2 pt-1"
                  style={{ height: ALTURA_HORA }}>
                  <span className="text-xs text-ab-muted/50">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>

            {colunasProfissionais.map((p) => {
              const ags = porDiaProfissional(p.id);
              const layout = layoutDoDia(ags);
              return (
                <div key={p.id}
                  className="relative border-l border-ab-border/30 cursor-pointer"
                  style={{ height: HORAS.length * ALTURA_HORA }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropProfissional(e, p.id)}
                  onClick={(e) => abrirCriacaoNoSlot(e, p.id)}>
                  {HORAS.map((h, hi) => (
                    <div key={h}
                      className="absolute left-0 right-0 border-b border-ab-border/30 pointer-events-none"
                      style={{ top: hi * ALTURA_HORA, height: ALTURA_HORA }} />
                  ))}

                  {bloqueiosDoDiaProfissional(p.id).map((b) => {
                    const { top, height } = posicaoBloqueio(b);
                    return (
                      <div key={b.id}
                        className="absolute left-0 right-0 bg-ab-muted/15 border-y border-ab-muted/30 pointer-events-none flex items-center px-1.5 overflow-hidden"
                        style={{ top, height }}>
                        <span className="text-[10px] text-ab-muted truncate">{b.titulo}</span>
                      </div>
                    );
                  })}

                  {ags.map((ag) => {
                    const { top, height } = posicaoAgendamento(ag);
                    const { lane, totalLanes } = layout.get(ag.id) ?? { lane: 0, totalLanes: 1 };
                    const larguraPct = 100 / totalLanes;
                    const cor = corProfissional(ag.profissional.id);
                    const isCancelado = ag.status === "cancelado";
                    return (
                      <div key={ag.id}
                        draggable={!isCancelado}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.setData("text/plain", ag.id);
                          setArrastando(ag.id);
                        }}
                        onDragEnd={() => setArrastando(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isCancelado) setAgendamentoEditando(ag);
                        }}
                        title={isCancelado ? undefined : "Clique para editar"}
                        style={{
                          top,
                          height,
                          left: `calc(${lane * larguraPct}% + 2px)`,
                          width: `calc(${larguraPct}% - 4px)`,
                        }}
                        className={`absolute border-l-3 rounded px-1.5 py-0.5 text-xs overflow-hidden transition-opacity duration-200 ring-1 ring-black/30
                          ${isCancelado ? "opacity-30 line-through" : `${cor} cursor-grab active:cursor-grabbing hover:brightness-125`}
                          ${arrastando === ag.id ? "opacity-40" : ""}`}>
                        <p className="font-medium leading-tight truncate">{ag.cliente_nome}</p>
                        <p className="truncate opacity-75">{ag.servico.nome}</p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {modalAberto && (
        <ModalAgendar
          profissionais={profissionais}
          servicos={servicos}
          inicial={agendarInicial ?? undefined}
          onFechar={() => { setModalAberto(false); setAgendarInicial(null); }}
          onCriado={(ag) => { setAgendamentos((prev) => [...prev, ag]); setAgendarInicial(null); }}
        />
      )}

      {agendamentoEditando && (
        <ModalEditar
          agendamento={agendamentoEditando}
          profissionais={profissionais}
          servicos={servicos}
          cancelando={cancelando === agendamentoEditando.id}
          marcandoStatus={marcandoStatus === agendamentoEditando.id}
          onFechar={() => setAgendamentoEditando(null)}
          onSalvo={(atualizado) => {
            setAgendamentos((prev) => prev.map((a) => (a.id === atualizado.id ? atualizado : a)));
            setAgendamentoEditando(null);
          }}
          onCancelar={async () => {
            const ok = await cancelar(agendamentoEditando.id);
            if (ok) setAgendamentoEditando(null);
          }}
          onMarcarStatus={(status) => marcarStatus(agendamentoEditando.id, status)}
        />
      )}

      {drawerBloqueiosAberto && (
        <DrawerBloqueios
          profissionais={profissionais}
          onFechar={() => setDrawerBloqueiosAberto(false)}
          onAlterado={() => setBloqueiosVersao((v) => v + 1)}
        />
      )}
    </div>
  );
}
