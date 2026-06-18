import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Servico } from "../lib/types";

interface FormState { nome: string; duracao_minutos: string; preco: string }
const FORM_VAZIO: FormState = { nome: "", duracao_minutos: "30", preco: "" };

export default function Servicos() {
  const [lista, setLista] = useState<Servico[]>([]);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = () => api.get<Servico[]>("/servicos").then((r) => setLista(r.data));
  useEffect(() => { carregar(); }, []);

  const abrirEdicao = (s: Servico) => {
    setEditandoId(s.id);
    setForm({ nome: s.nome, duracao_minutos: String(s.duracao_minutos), preco: s.preco });
  };

  const cancelar = () => { setEditandoId(null); setForm(FORM_VAZIO); setErro(""); };

  const salvar = async () => {
    if (!form.nome.trim()) { setErro("Nome obrigatório."); return; }
    const duracao = parseInt(form.duracao_minutos);
    const preco = parseFloat(form.preco);
    if (isNaN(duracao) || duracao < 5) { setErro("Duração mínima: 5 minutos."); return; }
    if (isNaN(preco) || preco < 0) { setErro("Preço inválido."); return; }

    setSalvando(true); setErro("");
    try {
      const payload = { nome: form.nome, duracao_minutos: duracao, preco };
      if (editandoId) {
        await api.put(`/servicos/${editandoId}`, payload);
      } else {
        await api.post("/servicos", payload);
      }
      cancelar(); carregar();
    } catch {
      setErro("Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este serviço?")) return;
    await api.delete(`/servicos/${id}`);
    carregar();
  };

  const formatarPreco = (valor: string | number) => {
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-ab-text">Serviços</h1>
        {!editandoId && (
          <button onClick={() => setEditandoId("")}
            className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 transition-all duration-200">
            + Novo
          </button>
        )}
      </div>

      {editandoId !== null && (
        <div className="bg-ab-hover border border-ab-border rounded-card p-5 mb-6 space-y-3">
          <h2 className="font-semibold text-ab-text">
            {editandoId ? "Editar serviço" : "Novo serviço"}
          </h2>
          <input
            className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200"
            placeholder="Nome do serviço *"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ab-muted mb-1 block">Duração (minutos)</label>
              <input type="number" min={5} max={480}
                className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200"
                value={form.duracao_minutos}
                onChange={(e) => setForm({ ...form, duracao_minutos: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-ab-muted mb-1 block">Preço (R$)</label>
              <input type="number" min={0} step="0.01"
                className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200"
                value={form.preco}
                onChange={(e) => setForm({ ...form, preco: e.target.value })}
              />
            </div>
          </div>
          {erro && <p className="text-ab-danger text-sm">{erro}</p>}
          <div className="flex gap-2">
            <button onClick={salvar} disabled={salvando}
              className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={cancelar}
              className="text-sm px-4 py-2 rounded-input border border-ab-border text-ab-muted hover:bg-ab-hover hover:text-ab-text transition-all duration-200">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-ab-card rounded-card border border-ab-border divide-y divide-ab-border/50">
        {lista.length === 0 && (
          <p className="p-6 text-center text-ab-muted text-sm">Nenhum serviço cadastrado.</p>
        )}
        {lista.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 hover:bg-ab-hover transition-colors duration-150">
            <div className="min-w-0">
              <p className="font-medium text-ab-text truncate">{s.nome}</p>
              <p className="text-xs text-ab-muted">{s.duracao_minutos} min · {formatarPreco(s.preco)}</p>
            </div>
            <div className="flex gap-3 shrink-0">
              <button onClick={() => abrirEdicao(s)}
                className="text-sm text-ab-accent hover:text-ab-accent-hover transition-colors duration-150">Editar</button>
              <button onClick={() => excluir(s.id)}
                className="text-sm text-ab-danger/70 hover:text-ab-danger transition-colors duration-150">Excluir</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
