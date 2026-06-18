import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import BotaoExportar from "../components/BotaoExportar";
import type { Cliente } from "../lib/types";

const BADGE_LABEL = { vip: "VIP", regular: "Regular", novo: "Novo" };
const BADGE_CLASS = {
  vip: "bg-yellow-500/15 text-yellow-400",
  regular: "bg-ab-accent/15 text-ab-accent",
  novo: "bg-ab-muted/15 text-ab-muted",
};

function Avatar({ nome }: { nome: string }) {
  const iniciais = nome.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-ab-accent to-ab-teal flex items-center justify-center text-white text-sm font-semibold shrink-0">
      {iniciais}
    </div>
  );
}

export default function Clientes() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback((q: string, p: number) => {
    setCarregando(true);
    const params = new URLSearchParams({ page: String(p) });
    if (q) params.set("q", q);
    api
      .get<{ clientes: Cliente[]; total: number; hasMore: boolean }>(`/clientes?${params}`)
      .then((r) => {
        setClientes(p === 1 ? r.data.clientes : (prev) => [...prev, ...r.data.clientes]);
        setTotal(r.data.total);
        setHasMore(r.data.hasMore);
      })
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => { carregar(busca, 1); setPage(1); }, []);

  const handleBusca = (v: string) => {
    setBusca(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); carregar(v, 1); }, 300);
  };

  const carregarMais = () => {
    const proxima = page + 1;
    setPage(proxima);
    carregar(busca, proxima);
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-ab-text">Clientes</h1>
          {!carregando && <p className="text-sm text-ab-muted mt-0.5">{total} cliente{total !== 1 ? "s" : ""} cadastrado{total !== 1 ? "s" : ""}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ab-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              className="bg-ab-bg border border-ab-border rounded-input pl-9 pr-3.5 py-2 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200 w-full sm:w-64"
              placeholder="Buscar por nome ou telefone…"
              value={busca}
              onChange={(e) => handleBusca(e.target.value)}
            />
          </div>
          <BotaoExportar urlBase="/relatorios/clientes" nomeBase="clientes" />
        </div>
      </div>

      <div className="bg-ab-card border border-ab-border rounded-card overflow-x-auto">
        {carregando && clientes.length === 0 ? (
          <p className="p-8 text-center text-ab-muted text-sm">Carregando...</p>
        ) : clientes.length === 0 ? (
          <p className="p-8 text-center text-ab-muted text-sm">Nenhum cliente encontrado.</p>
        ) : (
          <>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ab-border text-left text-ab-muted">
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Telefone</th>
                  <th className="px-5 py-3 font-medium">Último atendimento</th>
                  <th className="px-5 py-3 font-medium">Visitas</th>
                  <th className="px-5 py-3 font-medium">Frequência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ab-border/50">
                {clientes.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className="hover:bg-ab-hover/50 cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar nome={c.nome} />
                        <span className="font-medium text-ab-text">{c.nome}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">{c.telefone}</td>
                    <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">
                      {c.ultimoAtendimento
                        ? new Date(c.ultimoAtendimento).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-ab-muted">{c.totalVisitas}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_CLASS[c.badge]}`}>
                        {BADGE_LABEL[c.badge]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <div className="p-4 text-center border-t border-ab-border">
                <button
                  onClick={carregarMais}
                  disabled={carregando}
                  className="text-sm text-ab-accent hover:underline disabled:opacity-60"
                >
                  {carregando ? "Carregando..." : "Carregar mais"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
