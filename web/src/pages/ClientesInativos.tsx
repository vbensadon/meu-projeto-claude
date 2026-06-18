import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { ClienteInativo } from "../lib/types";

const FILTROS = [
  { label: "30+ dias", dias: 30 },
  { label: "60+ dias", dias: 60 },
  { label: "90+ dias", dias: 90 },
];

const TEMPLATE_PADRAO =
  "Olá {nome}! 👋 Sentimos sua falta na barbearia. Que tal agendar um horário? Responda essa mensagem para agendar. 😊";

function Avatar({ nome }: { nome: string }) {
  const iniciais = nome.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ab-accent to-ab-teal flex items-center justify-center text-white text-xs font-semibold shrink-0">
      {iniciais}
    </div>
  );
}

export default function ClientesInativos() {
  const [diasFiltro, setDiasFiltro] = useState(30);
  const [clientes, setClientes] = useState<ClienteInativo[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [mensagem, setMensagem] = useState(TEMPLATE_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<{ total: number; done: number; falhas: number } | null>(null);
  const [erroEnvio, setErroEnvio] = useState("");

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = (dias: number) => {
    setCarregando(true);
    setSelecionados(new Set());
    api
      .get<{ clientes: ClienteInativo[]; total: number }>(`/clientes/inativos?dias=${dias}`)
      .then((r) => { setClientes(r.data.clientes); setTotal(r.data.total); })
      .finally(() => setCarregando(false));
  };

  useEffect(() => { carregar(diasFiltro); }, [diasFiltro]);

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    if (selecionados.size === clientes.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(clientes.map((c) => c.id)));
    }
  };

  const iniciarEnvio = async () => {
    if (selecionados.size === 0 || !mensagem.trim()) return;
    setEnviando(true);
    setErroEnvio("");
    setProgresso({ total: selecionados.size, done: 0, falhas: 0 });

    try {
      await api.post("/campanhas/whatsapp", {
        clienteIds: Array.from(selecionados),
        mensagem,
      });

      let enviados = 0;
      const total = selecionados.size;
      const intervalo = 6100;

      pollingRef.current = setInterval(() => {
        enviados = Math.min(enviados + 1, total);
        setProgresso({ total, done: enviados, falhas: 0 });
        if (enviados >= total) {
          clearInterval(pollingRef.current!);
          setEnviando(false);
        }
      }, intervalo);
    } catch {
      setErroEnvio("Erro ao iniciar envio. Tente novamente.");
      setEnviando(false);
      setProgresso(null);
    }
  };

  const fecharDrawer = () => {
    setDrawerAberto(false);
    setProgresso(null);
    setEnviando(false);
    setErroEnvio("");
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  const clientesSelecionados = clientes.filter((c) => selecionados.has(c.id));
  const preview = mensagem.replace(/\{nome\}/g, clientesSelecionados[0]?.nome ?? "Cliente");

  const pctProgresso = progresso ? Math.round((progresso.done / progresso.total) * 100) : 0;
  const tudo = progresso && progresso.done >= progresso.total;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-ab-text">Clientes Inativos</h1>
          {!carregando && (
            <p className="text-sm text-ab-muted mt-0.5">
              {total} cliente{total !== 1 ? "s" : ""} sem visita nos últimos {diasFiltro} dias
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.dias}
              onClick={() => setDiasFiltro(f.dias)}
              className={`text-sm px-3.5 py-1.5 rounded-input font-medium transition-all duration-200 ${
                diasFiltro === f.dias
                  ? "bg-ab-accent text-white"
                  : "bg-ab-card border border-ab-border text-ab-muted hover:text-ab-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {selecionados.size > 0 && (
        <div className="flex items-center justify-between bg-ab-accent/10 border border-ab-accent/30 rounded-card px-4 py-2.5 mb-4">
          <p className="text-sm text-ab-accent font-medium">{selecionados.size} cliente{selecionados.size !== 1 ? "s" : ""} selecionado{selecionados.size !== 1 ? "s" : ""}</p>
          <button
            onClick={() => setDrawerAberto(true)}
            className="text-sm bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white px-4 py-1.5 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 transition-all duration-200"
          >
            Enviar mensagem →
          </button>
        </div>
      )}

      <div className="bg-ab-card border border-ab-border rounded-card overflow-x-auto">
        {carregando ? (
          <p className="p-8 text-center text-ab-muted text-sm">Carregando...</p>
        ) : clientes.length === 0 ? (
          <p className="p-8 text-center text-ab-muted text-sm">Nenhum cliente inativo neste período.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ab-border text-left text-ab-muted">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selecionados.size === clientes.length && clientes.length > 0}
                    onChange={toggleTodos}
                    className="w-4 h-4 rounded accent-ab-accent cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Último serviço</th>
                <th className="px-4 py-3 font-medium">Último profissional</th>
                <th className="px-4 py-3 font-medium">Dias sem visita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ab-border/50">
              {clientes.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => toggleSelecionado(c.id)}
                  className={`cursor-pointer transition-colors duration-150 ${
                    selecionados.has(c.id) ? "bg-ab-accent/5" : "hover:bg-ab-hover/50"
                  }`}
                >
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selecionados.has(c.id)}
                      onChange={() => toggleSelecionado(c.id)}
                      className="w-4 h-4 rounded accent-ab-accent cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar nome={c.nome} />
                      <span className="font-medium text-ab-text">{c.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-ab-muted whitespace-nowrap">{c.telefone}</td>
                  <td className="px-4 py-3.5 text-ab-muted">{c.ultimoServico ?? "—"}</td>
                  <td className="px-4 py-3.5 text-ab-muted">{c.ultimoProfissional ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    {c.diasSemVisita !== null ? (
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.diasSemVisita >= 90
                          ? "bg-ab-danger/15 text-ab-danger"
                          : c.diasSemVisita >= 60
                          ? "bg-yellow-500/15 text-yellow-400"
                          : "bg-ab-muted/15 text-ab-muted"
                      }`}>
                        {c.diasSemVisita}d
                      </span>
                    ) : (
                      <span className="text-ab-muted text-xs">Nunca visitou</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer de envio */}
      {drawerAberto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={fecharDrawer} />
          <div className="relative w-full max-w-md bg-ab-card border-l border-ab-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-ab-border">
              <h2 className="font-semibold text-ab-text">
                Enviar para {selecionados.size} cliente{selecionados.size !== 1 ? "s" : ""}
              </h2>
              <button onClick={fecharDrawer} className="text-ab-muted hover:text-ab-text transition-colors duration-150">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-xs text-ab-muted block mb-1.5">Mensagem <span className="text-ab-muted/60">(use {"{nome}"} para personalizar)</span></label>
                <textarea
                  className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200 min-h-[120px] resize-y"
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  disabled={enviando}
                />
              </div>

              {clientesSelecionados.length > 0 && (
                <div>
                  <p className="text-xs text-ab-muted mb-1.5">Preview ({clientesSelecionados[0].nome})</p>
                  <div className="bg-ab-bg border border-ab-border/50 rounded-card p-3 text-sm text-ab-text/80 whitespace-pre-wrap">
                    {preview}
                  </div>
                </div>
              )}

              {progresso && (
                <div>
                  <div className="flex justify-between text-xs text-ab-muted mb-1.5">
                    <span>{tudo ? "Envio concluído!" : `Enviando ${progresso.done}/${progresso.total}…`}</span>
                    <span>{pctProgresso}%</span>
                  </div>
                  <div className="w-full bg-ab-border rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${tudo ? "bg-ab-teal" : "bg-ab-accent"}`}
                      style={{ width: `${pctProgresso}%` }}
                    />
                  </div>
                  {tudo && (
                    <p className="text-sm text-ab-teal mt-2">
                      ✓ {progresso.total - progresso.falhas} enviado{progresso.total - progresso.falhas !== 1 ? "s" : ""}
                      {progresso.falhas > 0 && `, ${progresso.falhas} falha${progresso.falhas !== 1 ? "s" : ""}`}
                    </p>
                  )}
                </div>
              )}

              {erroEnvio && <p className="text-sm text-ab-danger">{erroEnvio}</p>}
            </div>

            <div className="p-5 border-t border-ab-border">
              {!tudo ? (
                <button
                  onClick={iniciarEnvio}
                  disabled={enviando || !mensagem.trim()}
                  className="w-full bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm py-2.5 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200"
                >
                  {enviando ? "Enviando…" : `Enviar para ${selecionados.size} cliente${selecionados.size !== 1 ? "s" : ""}`}
                </button>
              ) : (
                <button
                  onClick={fecharDrawer}
                  className="w-full bg-ab-teal/15 text-ab-teal text-sm py-2.5 rounded-input font-medium hover:bg-ab-teal/25 transition-all duration-200"
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
