import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AvaliacaoResumo } from "../lib/types";

function Estrelas({ valor, total }: { valor: number; total?: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`text-lg leading-none ${n <= Math.round(valor) ? "text-yellow-400" : "text-ab-border"}`}>★</span>
      ))}
      {total !== undefined && <span className="text-xs text-ab-muted ml-1">({total})</span>}
    </div>
  );
}

function BarraDistribuicao({ distribuicao, total }: { distribuicao: Record<string, number>; total: number }) {
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((n) => {
        const qt = distribuicao[n] ?? 0;
        const pct = total > 0 ? (qt / total) * 100 : 0;
        return (
          <div key={n} className="flex items-center gap-2 text-xs">
            <span className="text-ab-muted w-2">{n}</span>
            <span className="text-yellow-400 text-base leading-none">★</span>
            <div className="flex-1 bg-ab-border/40 rounded-full h-2">
              <div className="bg-yellow-400 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-ab-muted w-5 text-right">{qt}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Avaliacoes() {
  const [resumo, setResumo] = useState<AvaliacaoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ resumo: AvaliacaoResumo[] }>("/avaliacoes/resumo")
      .then((r) => setResumo(r.data.resumo))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ab-text">Avaliações</h1>
        <p className="text-sm text-ab-muted mt-0.5">Avaliações dos clientes após cada atendimento</p>
      </div>

      {carregando ? (
        <p className="text-center text-ab-muted text-sm py-8">Carregando...</p>
      ) : resumo.length === 0 ? (
        <div className="bg-ab-card border border-ab-border rounded-card p-8 text-center">
          <p className="text-ab-muted text-sm">Nenhuma avaliação recebida ainda.</p>
          <p className="text-xs text-ab-muted/70 mt-1">As avaliações são enviadas automaticamente quando um agendamento é concluído.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {resumo.map((r) => (
            <div key={r.profissional.id} className="bg-ab-card border border-ab-border rounded-card overflow-hidden">
              {/* Header do profissional */}
              <button
                onClick={() => setExpandido(expandido === r.profissional.id ? null : r.profissional.id)}
                className="w-full flex items-center gap-4 p-5 hover:bg-ab-hover/50 transition-colors duration-150 text-left"
              >
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-ab-accent to-ab-teal flex items-center justify-center text-white font-bold shrink-0">
                  {r.profissional.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-ab-text">{r.profissional.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Estrelas valor={r.media} total={r.total} />
                    <span className="text-sm font-semibold text-ab-text">{r.media.toFixed(1)}</span>
                  </div>
                </div>
                <svg
                  className={`w-4 h-4 text-ab-muted transition-transform duration-200 ${expandido === r.profissional.id ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Detalhe expandido */}
              {expandido === r.profissional.id && (
                <div className="border-t border-ab-border p-5 space-y-5">
                  <div>
                    <p className="text-xs text-ab-muted mb-2 font-medium">Distribuição de notas</p>
                    <BarraDistribuicao distribuicao={r.distribuicao} total={r.total} />
                  </div>

                  {r.comentariosRecentes.length > 0 && (
                    <div>
                      <p className="text-xs text-ab-muted mb-3 font-medium">Comentários recentes</p>
                      <div className="space-y-3">
                        {r.comentariosRecentes.map((c, i) => (
                          <div key={i} className="bg-ab-bg rounded-input p-3 border border-ab-border/50">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-ab-text">{c.cliente}</span>
                              <div className="flex items-center gap-1">
                                {[1,2,3,4,5].map((n) => (
                                  <span key={n} className={`text-sm leading-none ${n <= c.nota ? "text-yellow-400" : "text-ab-border"}`}>★</span>
                                ))}
                              </div>
                            </div>
                            <p className="text-sm text-ab-muted">{c.comentario}</p>
                            <p className="text-xs text-ab-muted/60 mt-1">
                              {new Date(c.data).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
