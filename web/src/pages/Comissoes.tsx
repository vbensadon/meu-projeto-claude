import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import BotaoExportar from "../components/BotaoExportar";
import type { ComissaoBarbeiro, RegraComissao, RelatorioComissao, Profissional, Servico } from "../lib/types";

function mesAtualISO(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

const R$ = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mesLabel = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

// ─── Aba Fechamento ────────────────────────────────────────────────────────────

function AbaFechamento() {
  const [mes, setMes] = useState(mesAtualISO());
  const [relatorio, setRelatorio] = useState<RelatorioComissao[]>([]);
  const [legado, setLegado] = useState<ComissaoBarbeiro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pagando, setPagando] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    setCarregando(true);
    Promise.all([
      api.get<{ relatorio: RelatorioComissao[] }>(`/comissoes/relatorio?mes=${mes}`),
      api.get<ComissaoBarbeiro[]>(`/comissoes?mes=${mes}`),
    ])
      .then(([r1, r2]) => { setRelatorio(r1.data.relatorio); setLegado(r2.data); })
      .catch(() => setErro("Erro ao carregar relatório."))
      .finally(() => setCarregando(false));
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  const marcarComoPago = async (profissionalId: string) => {
    if (!confirm("Confirmar pagamento da comissão deste período?")) return;
    setPagando(profissionalId);
    setErro("");
    try {
      await api.post("/comissoes/pagar", { profissional_id: profissionalId, mes });
      await carregar();
    } catch { setErro("Erro ao marcar comissão como paga."); }
    finally { setPagando(null); }
  };

  // Mescla dados do relatório detalhado com legado (fallback)
  const dados = relatorio.length > 0 ? relatorio : legado.map((l) => ({
    profissional: l.profissional, mes: l.mes,
    total_atendimentos: l.atendimentos, receita_bruta: l.receita,
    pct_medio: l.comissao_percentual, total_comissao: l.comissao_valor,
    total_pago: l.pago ? (l.valor_pago ?? 0) : 0, total_pendente: l.pago ? 0 : l.comissao_valor,
    pago: l.pago, pago_em: l.pago_em, lancamentos: [],
  } as RelatorioComissao));

  const totalReceita = dados.reduce((s, d) => s + d.receita_bruta, 0);
  const totalComissao = dados.reduce((s, d) => s + d.total_comissao, 0);
  const totalPendente = dados.reduce((s, d) => s + d.total_pendente, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month" value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="bg-ab-card border border-ab-border rounded-input px-3.5 py-2 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all"
        />
        <span className="text-sm text-ab-muted capitalize flex-1">{mesLabel(mes)}</span>
        <BotaoExportar
          urlBase="/relatorios/comissoes"
          params={{ mes }}
          nomeBase={`comissoes_${mes}`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Receita do mês", valor: totalReceita, cor: "text-ab-text" },
          { label: "Total em comissões", valor: totalComissao, cor: "text-ab-text" },
          { label: "Pendente de pagamento", valor: totalPendente, cor: "text-ab-danger" },
        ].map(({ label, valor, cor }) => (
          <div key={label} className="bg-ab-card border border-ab-border rounded-card p-5">
            <p className="text-sm text-ab-muted">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${cor}`}>{R$(valor)}</p>
          </div>
        ))}
      </div>

      {erro && <p className="text-ab-danger text-sm">{erro}</p>}

      <div className="space-y-3">
        {carregando ? (
          <p className="text-center py-12 text-ab-muted">Carregando...</p>
        ) : dados.length === 0 ? (
          <p className="text-center py-12 text-ab-muted">Nenhum profissional ativo.</p>
        ) : dados.map((d) => (
          <div key={d.profissional.id} className="bg-ab-card border border-ab-border rounded-card overflow-hidden">
            <div
              className="flex items-center gap-4 p-5 cursor-pointer hover:bg-ab-hover/50 transition-colors"
              onClick={() => setExpandido(expandido === d.profissional.id ? null : d.profissional.id)}
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-ab-accent to-ab-teal flex items-center justify-center text-white text-sm font-bold shrink-0">
                {d.profissional.nome.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ab-text">{d.profissional.nome}</p>
                <p className="text-xs text-ab-muted">
                  {d.total_atendimentos} atend. · {R$(d.receita_bruta)} receita · {d.pct_medio.toFixed(1)}% médio
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold text-ab-text">{R$(d.total_comissao)}</p>
                {d.pago ? (
                  <span className="text-xs text-ab-teal font-medium">Pago {d.pago_em ? new Date(d.pago_em).toLocaleDateString("pt-BR") : ""}</span>
                ) : (
                  <span className="text-xs text-yellow-400 font-medium">{R$(d.total_pendente)} pendente</span>
                )}
              </div>
              {!d.pago && d.total_comissao > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); marcarComoPago(d.profissional.id); }}
                  disabled={pagando === d.profissional.id}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-input bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all whitespace-nowrap"
                >
                  {pagando === d.profissional.id ? "Salvando..." : "Marcar pago"}
                </button>
              )}
              <svg className={`w-4 h-4 text-ab-muted transition-transform shrink-0 ${expandido === d.profissional.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {expandido === d.profissional.id && d.lancamentos.length > 0 && (
              <div className="border-t border-ab-border overflow-x-auto">
                <table className="w-full min-w-[480px] text-xs">
                  <thead>
                    <tr className="text-ab-muted border-b border-ab-border/50">
                      <th className="px-5 py-2.5 text-left font-medium">Data</th>
                      <th className="px-5 py-2.5 text-left font-medium">Cliente</th>
                      <th className="px-5 py-2.5 text-right font-medium">Valor serviço</th>
                      <th className="px-5 py-2.5 text-right font-medium">% / Tipo</th>
                      <th className="px-5 py-2.5 text-right font-medium">Comissão</th>
                      <th className="px-5 py-2.5 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ab-border/40">
                    {d.lancamentos.map((l) => (
                      <tr key={l.id} className="hover:bg-ab-hover/40 transition-colors">
                        <td className="px-5 py-2.5 text-ab-muted whitespace-nowrap">
                          {new Date(l.data).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-5 py-2.5 text-ab-text">{l.cliente}</td>
                        <td className="px-5 py-2.5 text-ab-muted text-right whitespace-nowrap">{R$(l.valor_bruto)}</td>
                        <td className="px-5 py-2.5 text-ab-muted text-right whitespace-nowrap">
                          {l.tipo_regra === "fixo" ? `${R$(l.comissao_valor)} fixo` : `${l.comissao_percentual.toFixed(1)}%`}
                        </td>
                        <td className="px-5 py-2.5 text-ab-text font-medium text-right whitespace-nowrap">{R$(l.comissao_valor)}</td>
                        <td className="px-5 py-2.5 text-center">
                          {l.pago ? (
                            <span className="text-xs text-ab-teal">Pago</span>
                          ) : (
                            <span className="text-xs text-yellow-400">Pendente</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {expandido === d.profissional.id && d.lancamentos.length === 0 && (
              <p className="px-5 py-3 text-xs text-ab-muted border-t border-ab-border">
                Nenhum lançamento registrado — lançamentos são criados automaticamente ao marcar agendamentos como concluídos.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Aba Regras ────────────────────────────────────────────────────────────────

function ModalRegra({
  regra, profissionais, servicos, onSalvar, onFechar,
}: {
  regra: Partial<RegraComissao> | null;
  profissionais: Profissional[];
  servicos: Servico[];
  onSalvar: () => void;
  onFechar: () => void;
}) {
  const [profissionalId, setProfissionalId] = useState(regra?.profissional_id ?? "");
  const [servicoId, setServicoId] = useState(regra?.servico_id ?? "");
  const [tipo, setTipo] = useState<"percentual" | "fixo">(regra?.tipo ?? "percentual");
  const [valor, setValor] = useState(regra ? String(Number(regra.valor)) : "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const salvar = async () => {
    if (!profissionalId || !valor || Number(valor) <= 0) { setErro("Preencha todos os campos."); return; }
    setSalvando(true); setErro("");
    try {
      await api.post("/comissoes/regras", {
        profissional_id: profissionalId,
        servico_id: servicoId || null,
        tipo,
        valor: Number(valor),
      });
      onSalvar();
    } catch (e) {
      const msg = (e as { response?: { data?: { erro?: string } } }).response?.data?.erro;
      setErro(msg ?? "Erro ao salvar regra.");
    } finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onFechar} />
      <div className="relative bg-ab-card border border-ab-border rounded-card w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-ab-border">
          <h2 className="text-base font-semibold text-ab-text">{regra?.id ? "Editar regra" : "Nova regra de comissão"}</h2>
          <button onClick={onFechar} className="text-ab-muted hover:text-ab-text transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">Barbeiro</label>
            <select
              value={profissionalId}
              onChange={(e) => setProfissionalId(e.target.value)}
              className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all"
            >
              <option value="">Selecione...</option>
              {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">Serviço <span className="text-ab-muted/60">(vazio = aplica a todos)</span></label>
            <select
              value={servicoId}
              onChange={(e) => setServicoId(e.target.value)}
              className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all"
            >
              <option value="">Todos os serviços</option>
              {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">Tipo</label>
            <div className="flex gap-3">
              {[{ v: "percentual" as const, l: "Percentual (%)" }, { v: "fixo" as const, l: "Valor fixo (R$)" }].map(({ v, l }) => (
                <label key={v} className={`flex-1 flex items-center gap-2 p-3 rounded-input border cursor-pointer transition-all text-sm ${tipo === v ? "border-ab-accent bg-ab-accent/10 text-ab-text" : "border-ab-border text-ab-muted hover:border-ab-accent/50"}`}>
                  <input type="radio" className="accent-ab-accent" checked={tipo === v} onChange={() => setTipo(v)} />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">
              {tipo === "percentual" ? "Percentual (%)" : "Valor fixo (R$)"}
            </label>
            <input
              type="number" min="0.01" step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={tipo === "percentual" ? "ex: 40" : "ex: 15.00"}
              className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all"
            />
          </div>
          {erro && <p className="text-xs text-ab-danger">{erro}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-ab-border">
          <button onClick={onFechar} className="flex-1 px-4 py-2.5 text-sm text-ab-muted border border-ab-border rounded-input hover:bg-ab-hover transition-colors">Cancelar</button>
          <button
            onClick={salvar} disabled={salvando}
            className="flex-1 px-4 py-2.5 text-sm bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all"
          >
            {salvando ? "Salvando..." : "Salvar regra"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AbaRegras() {
  const [regras, setRegras] = useState<RegraComissao[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        api.get<{ regras: RegraComissao[] }>("/comissoes/regras"),
        api.get<Profissional[]>("/profissionais"),
        api.get<Servico[]>("/servicos"),
      ]);
      setRegras(r1.data.regras);
      setProfissionais(r2.data);
      setServicos(r3.data);
    } finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const remover = async (id: string) => {
    if (!confirm("Remover esta regra?")) return;
    setRemovendo(id);
    try { await api.delete(`/comissoes/regras/${id}`); await carregar(); }
    finally { setRemovendo(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ab-muted">
          Regras específicas têm prioridade sobre o percentual padrão do profissional.
          Serviço específico tem prioridade sobre regra geral do barbeiro.
        </p>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 transition-all shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nova regra
        </button>
      </div>

      <div className="bg-ab-card border border-ab-border rounded-card overflow-x-auto">
        {carregando ? (
          <p className="p-8 text-center text-ab-muted text-sm">Carregando...</p>
        ) : regras.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-ab-muted text-sm">Nenhuma regra definida.</p>
            <p className="text-xs text-ab-muted/60">
              Sem regras, usa-se o percentual padrão de cada profissional (configurado em Profissionais).
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-ab-border text-left text-ab-muted">
                <th className="px-5 py-3 font-medium">Barbeiro</th>
                <th className="px-5 py-3 font-medium">Serviço</th>
                <th className="px-5 py-3 font-medium">Tipo</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ab-border/50">
              {regras.map((r) => (
                <tr key={r.id} className="hover:bg-ab-hover/50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-ab-text">{r.profissional.nome}</td>
                  <td className="px-5 py-3.5 text-ab-muted">{r.servico?.nome ?? <span className="italic text-ab-muted/60">Todos</span>}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.tipo === "percentual" ? "bg-ab-accent/15 text-ab-accent" : "bg-ab-teal/15 text-ab-teal"}`}>
                      {r.tipo === "percentual" ? "%" : "Fixo"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-ab-text">
                    {r.tipo === "percentual" ? `${Number(r.valor).toFixed(1)}%` : R$(Number(r.valor))}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => remover(r.id)} disabled={removendo === r.id}
                      className="text-xs text-ab-danger hover:text-ab-danger/80 disabled:opacity-50 transition-colors"
                    >
                      {removendo === r.id ? "Removendo..." : "Remover"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <ModalRegra
          regra={null}
          profissionais={profissionais}
          servicos={servicos}
          onSalvar={() => { setModal(false); carregar(); }}
          onFechar={() => setModal(false)}
        />
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function Comissoes() {
  const [aba, setAba] = useState<"fechamento" | "regras">("fechamento");

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-ab-text">Comissões</h1>

      <div className="flex gap-1 bg-ab-bg rounded-input p-1 border border-ab-border w-fit">
        {[
          { k: "fechamento" as const, l: "Fechamento Mensal" },
          { k: "regras" as const, l: "Regras" },
        ].map(({ k, l }) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`px-4 py-2 text-sm rounded-input font-medium transition-all ${aba === k ? "bg-ab-accent text-white shadow-sm" : "text-ab-muted hover:text-ab-text"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {aba === "fechamento" ? <AbaFechamento /> : <AbaRegras />}
    </div>
  );
}
