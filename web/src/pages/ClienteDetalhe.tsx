import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { ClienteDetalhe, ClienteAgendamento } from "../lib/types";

const BADGE_LABEL = { vip: "VIP", regular: "Regular", novo: "Novo" };
const BADGE_CLASS = {
  vip: "bg-yellow-500/15 text-yellow-400",
  regular: "bg-ab-accent/15 text-ab-accent",
  novo: "bg-ab-muted/15 text-ab-muted",
};

const STATUS_LABEL: Record<ClienteAgendamento["status"], string> = {
  pendente: "Pendente", confirmado: "Confirmado", cancelado: "Cancelado",
  concluido: "Concluído", nao_compareceu: "Não compareceu",
};
const STATUS_BADGE: Record<ClienteAgendamento["status"], string> = {
  pendente: "bg-yellow-500/15 text-yellow-400",
  confirmado: "bg-ab-accent/15 text-ab-accent",
  cancelado: "bg-ab-danger/15 text-ab-danger",
  concluido: "bg-ab-teal/15 text-ab-teal",
  nao_compareceu: "bg-ab-muted/15 text-ab-muted",
};

function Avatar({ nome, grande }: { nome: string; grande?: boolean }) {
  const iniciais = nome.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={`rounded-full bg-gradient-to-br from-ab-accent to-ab-teal flex items-center justify-center text-white font-bold shrink-0 ${grande ? "w-16 h-16 text-2xl" : "w-9 h-9 text-sm"}`}>
      {iniciais}
    </div>
  );
}

type Aba = "historico" | "preferencias" | "dados";

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<ClienteDetalhe | null>(null);
  const [aba, setAba] = useState<Aba>("historico");
  const [agendamentos, setAgendamentos] = useState<ClienteAgendamento[]>([]);
  const [totalAgs, setTotalAgs] = useState(0);
  const [pageAgs, setPageAgs] = useState(1);
  const [carregandoAgs, setCarregandoAgs] = useState(false);

  const [notas, setNotas] = useState("");
  const [preferencias, setPreferencias] = useState("");
  const [nomeEdit, setNomeEdit] = useState("");
  const [telefoneEdit, setTelefoneEdit] = useState("");
  const [aniversarioEdit, setAniversarioEdit] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msgPref, setMsgPref] = useState("");
  const [msgDados, setMsgDados] = useState("");

  useEffect(() => {
    if (!id) return;
    api.get<ClienteDetalhe>(`/clientes/${id}`).then((r) => {
      setCliente(r.data);
      setNotas(r.data.notas ?? "");
      setPreferencias(r.data.preferencias ?? "");
      setNomeEdit(r.data.nome);
      setTelefoneEdit(r.data.telefone);
      setAniversarioEdit(r.data.aniversario ? r.data.aniversario.slice(0, 10) : "");
    });
  }, [id]);

  const carregarAgs = (p: number) => {
    if (!id) return;
    setCarregandoAgs(true);
    api
      .get<{ agendamentos: ClienteAgendamento[]; total: number }>(`/clientes/${id}/agendamentos?page=${p}`)
      .then((r) => {
        setAgendamentos(p === 1 ? r.data.agendamentos : (prev) => [...prev, ...r.data.agendamentos]);
        setTotalAgs(r.data.total);
      })
      .finally(() => setCarregandoAgs(false));
  };

  useEffect(() => {
    if (aba === "historico" && agendamentos.length === 0) carregarAgs(1);
  }, [aba]);

  const salvarPreferencias = async () => {
    if (!id) return;
    setSalvando(true); setMsgPref("");
    try {
      await api.patch(`/clientes/${id}`, { notas: notas || null, preferencias: preferencias || null });
      setMsgPref("Salvo com sucesso.");
    } catch { setMsgPref("Erro ao salvar."); }
    finally { setSalvando(false); }
  };

  const salvarDados = async () => {
    if (!id) return;
    setSalvando(true); setMsgDados("");
    try {
      const payload: Record<string, unknown> = { nome: nomeEdit };
      if (aniversarioEdit) payload.aniversario = new Date(aniversarioEdit).toISOString();
      else payload.aniversario = null;
      await api.patch(`/clientes/${id}`, payload);
      setCliente((c) => c ? { ...c, nome: nomeEdit, aniversario: aniversarioEdit ? new Date(aniversarioEdit).toISOString() : null } : c);
      setMsgDados("Dados atualizados.");
    } catch { setMsgDados("Erro ao salvar."); }
    finally { setSalvando(false); }
  };

  if (!cliente) return <div className="p-8 text-center text-ab-muted">Carregando...</div>;

  const inputClass = "w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200";
  const ehErro = (m: string) => m.includes("Erro");

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {/* Back */}
      <button onClick={() => navigate("/clientes")} className="flex items-center gap-1.5 text-sm text-ab-muted hover:text-ab-text transition-colors duration-150">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Clientes
      </button>

      {/* Header */}
      <div className="bg-ab-card border border-ab-border rounded-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <Avatar nome={cliente.nome} grande />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-ab-text">{cliente.nome}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_CLASS[cliente.badge]}`}>
              {BADGE_LABEL[cliente.badge]}
            </span>
          </div>
          <p className="text-sm text-ab-muted mt-0.5">{cliente.telefone}</p>
          <p className="text-xs text-ab-muted mt-1">
            Membro desde {new Date(cliente.created_at).toLocaleDateString("pt-BR")}
            {cliente.fonte === "whatsapp" ? " · via WhatsApp" : cliente.fonte === "manual" ? " · cadastro manual" : " · presencial"}
          </p>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-ab-card border border-ab-border rounded-card p-4">
          <p className="text-xs text-ab-muted">Total de visitas</p>
          <p className="text-2xl font-bold text-ab-text mt-0.5">{cliente.totalVisitas}</p>
        </div>
        <div className="bg-ab-card border border-ab-border rounded-card p-4">
          <p className="text-xs text-ab-muted">Ticket médio</p>
          <p className="text-2xl font-bold text-ab-text mt-0.5">
            {cliente.ticketMedio > 0
              ? `R$ ${cliente.ticketMedio.toFixed(2).replace(".", ",")}`
              : "—"}
          </p>
        </div>
        <div className="bg-ab-card border border-ab-border rounded-card p-4">
          <p className="text-xs text-ab-muted">Última visita</p>
          <p className="text-2xl font-bold text-ab-text mt-0.5">
            {cliente.ultimoAtendimento
              ? new Date(cliente.ultimoAtendimento).toLocaleDateString("pt-BR")
              : "—"}
          </p>
          {cliente.barbeiroFavorito && (
            <p className="text-xs text-ab-muted mt-1">Favorito: {cliente.barbeiroFavorito.nome}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-ab-card border border-ab-border rounded-card p-1">
        {(["historico", "preferencias", "dados"] as Aba[]).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`flex-1 text-sm py-2 rounded-input font-medium transition-all duration-200 ${
              aba === a ? "bg-ab-accent/15 text-ab-accent" : "text-ab-muted hover:text-ab-text"
            }`}
          >
            {a === "historico" ? "Histórico" : a === "preferencias" ? "Preferências" : "Dados"}
          </button>
        ))}
      </div>

      {/* Conteúdo das abas */}
      {aba === "historico" && (
        <div className="bg-ab-card border border-ab-border rounded-card overflow-x-auto">
          {carregandoAgs && agendamentos.length === 0 ? (
            <p className="p-6 text-center text-ab-muted text-sm">Carregando...</p>
          ) : agendamentos.length === 0 ? (
            <p className="p-6 text-center text-ab-muted text-sm">Nenhum agendamento registrado.</p>
          ) : (
            <>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ab-border text-left text-ab-muted">
                    <th className="px-5 py-3 font-medium">Data</th>
                    <th className="px-5 py-3 font-medium">Profissional</th>
                    <th className="px-5 py-3 font-medium">Serviço</th>
                    <th className="px-5 py-3 font-medium">Valor</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ab-border/50">
                  {agendamentos.map((a) => (
                    <tr key={a.id} className="hover:bg-ab-hover/50 transition-colors duration-150">
                      <td className="px-5 py-3.5 text-ab-text whitespace-nowrap">
                        {new Date(a.data_hora).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">{a.profissional.nome}</td>
                      <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">{a.servico.nome}</td>
                      <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">
                        R$ {Number(a.preco ?? a.servico.preco).toFixed(2).replace(".", ",")}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_BADGE[a.status]}`}>
                          {STATUS_LABEL[a.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {agendamentos.length < totalAgs && (
                <div className="p-4 text-center border-t border-ab-border">
                  <button
                    onClick={() => { const p = pageAgs + 1; setPageAgs(p); carregarAgs(p); }}
                    disabled={carregandoAgs}
                    className="text-sm text-ab-accent hover:underline disabled:opacity-60"
                  >
                    {carregandoAgs ? "Carregando..." : "Carregar mais"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {aba === "preferencias" && (
        <div className="bg-ab-card border border-ab-border rounded-card p-5 space-y-4">
          <div>
            <label className="text-xs text-ab-muted block mb-1.5">Anotações livres</label>
            <textarea
              className={`${inputClass} min-h-[120px] resize-y`}
              placeholder="Observações sobre o cliente, preferências de atendimento…"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1.5">Preferências estruturadas <span className="text-ab-muted/60">(JSON ou texto livre)</span></label>
            <textarea
              className={`${inputClass} min-h-[80px] resize-y font-mono text-xs`}
              placeholder='{"style": "degradê", "beard": true}'
              value={preferencias}
              onChange={(e) => setPreferencias(e.target.value)}
            />
          </div>
          {msgPref && <p className={`text-sm ${ehErro(msgPref) ? "text-ab-danger" : "text-ab-teal"}`}>{msgPref}</p>}
          <button onClick={salvarPreferencias} disabled={salvando}
            className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200">
            {salvando ? "Salvando..." : "Salvar preferências"}
          </button>
        </div>
      )}

      {aba === "dados" && (
        <div className="bg-ab-card border border-ab-border rounded-card p-5 space-y-4">
          <div>
            <label className="text-xs text-ab-muted block mb-1.5">Nome</label>
            <input className={inputClass} value={nomeEdit} onChange={(e) => setNomeEdit(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1.5">Telefone</label>
            <input className={inputClass} value={telefoneEdit} disabled />
            <p className="text-xs text-ab-muted mt-1">O telefone não pode ser alterado pois vincula o histórico de agendamentos.</p>
          </div>
          <div>
            <label className="text-xs text-ab-muted block mb-1.5">Aniversário</label>
            <input type="date" className={inputClass} value={aniversarioEdit} onChange={(e) => setAniversarioEdit(e.target.value)} />
          </div>
          {msgDados && <p className={`text-sm ${ehErro(msgDados) ? "text-ab-danger" : "text-ab-teal"}`}>{msgDados}</p>}
          <button onClick={salvarDados} disabled={salvando}
            className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200">
            {salvando ? "Salvando..." : "Salvar dados"}
          </button>
        </div>
      )}
    </div>
  );
}
