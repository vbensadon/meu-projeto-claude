import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Profissional } from "../lib/types";

interface FormState { nome: string; telefone_whatsapp: string; google_calendar_id: string; comissao_percentual: string }
const FORM_VAZIO: FormState = { nome: "", telefone_whatsapp: "", google_calendar_id: "", comissao_percentual: "50" };

export default function Profissionais() {
  const [lista, setLista] = useState<Profissional[]>([]);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = () =>
    api.get<Profissional[]>("/profissionais").then((r) => setLista(r.data));

  useEffect(() => { carregar(); }, []);

  const abrirEdicao = (p: Profissional) => {
    setEditandoId(p.id);
    setForm({
      nome: p.nome,
      telefone_whatsapp: p.telefone_whatsapp ?? "",
      google_calendar_id: p.google_calendar_id ?? "",
      comissao_percentual: p.comissao_percentual,
    });
  };

  const cancelar = () => { setEditandoId(null); setForm(FORM_VAZIO); setErro(""); };

  const salvar = async () => {
    if (!form.nome.trim()) { setErro("Nome obrigatório."); return; }
    const comissao = parseFloat(form.comissao_percentual);
    if (isNaN(comissao) || comissao < 0 || comissao > 100) { setErro("Comissão deve ser entre 0 e 100%."); return; }
    setSalvando(true); setErro("");
    try {
      const payload = {
        nome: form.nome,
        comissao_percentual: comissao,
        ...(form.telefone_whatsapp && { telefone_whatsapp: form.telefone_whatsapp }),
        ...(form.google_calendar_id && { google_calendar_id: form.google_calendar_id }),
      };
      if (editandoId) {
        await api.put(`/profissionais/${editandoId}`, payload);
      } else {
        await api.post("/profissionais", payload);
      }
      cancelar();
      carregar();
    } catch {
      setErro("Erro ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  const desativar = async (id: string) => {
    if (!confirm("Desativar este profissional?")) return;
    await api.delete(`/profissionais/${id}`);
    carregar();
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-ab-text">Profissionais</h1>
        {!editandoId && (
          <button
            onClick={() => setEditandoId("")}
            className="bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm px-4 py-2 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 transition-all duration-200"
          >
            + Novo
          </button>
        )}
      </div>

      {/* Formulário inline */}
      {editandoId !== null && (
        <div className="bg-ab-hover border border-ab-border rounded-card p-5 mb-6 space-y-3">
          <h2 className="font-semibold text-ab-text">
            {editandoId ? "Editar profissional" : "Novo profissional"}
          </h2>
          <input
            className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200"
            placeholder="Nome *"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          <input
            className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200"
            placeholder="WhatsApp (ex: whatsapp:+5511999999999)"
            value={form.telefone_whatsapp}
            onChange={(e) => setForm({ ...form, telefone_whatsapp: e.target.value })}
          />
          <input
            className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200"
            placeholder="ID do Google Calendar (opcional)"
            value={form.google_calendar_id}
            onChange={(e) => setForm({ ...form, google_calendar_id: e.target.value })}
          />
          <div>
            <label className="text-xs text-ab-muted mb-1 block">Comissão (%)</label>
            <input type="number" min={0} max={100} step="1"
              className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200"
              value={form.comissao_percentual}
              onChange={(e) => setForm({ ...form, comissao_percentual: e.target.value })}
            />
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

      {/* Lista */}
      <div className="bg-ab-card rounded-card border border-ab-border divide-y divide-ab-border/50">
        {lista.length === 0 && (
          <p className="p-6 text-center text-ab-muted text-sm">Nenhum profissional cadastrado.</p>
        )}
        {lista.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 hover:bg-ab-hover transition-colors duration-150">
            <div className="min-w-0">
              <p className="font-medium text-ab-text truncate">{p.nome}</p>
              <p className="text-xs text-ab-muted truncate">
                {p.telefone_whatsapp && <>{p.telefone_whatsapp} · </>}
                Comissão: {Number(p.comissao_percentual)}%
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {!p.ativo && (
                <span className="text-xs bg-ab-muted/10 text-ab-muted px-2 py-0.5 rounded-full">inativo</span>
              )}
              <button onClick={() => abrirEdicao(p)}
                className="text-sm text-ab-accent hover:text-ab-accent-hover transition-colors duration-150">
                Editar
              </button>
              {p.ativo && (
                <button onClick={() => desativar(p.id)}
                  className="text-sm text-ab-danger/70 hover:text-ab-danger transition-colors duration-150">
                  Desativar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
