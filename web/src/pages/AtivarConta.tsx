import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function AtivarConta() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!token) setErro("Link de convite inválido. Solicite um novo convite.");
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) { setErro("A senha deve ter pelo menos 6 caracteres."); return; }
    if (senha !== confirmacao) { setErro("As senhas não coincidem."); return; }
    setSalvando(true); setErro("");
    try {
      await api.post("/auth/ativar-conta", { token, senha });
      setSucesso(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (e) {
      const msg = (e as { response?: { data?: { erro?: string } } }).response?.data?.erro;
      setErro(msg ?? "Erro ao ativar conta.");
    } finally { setSalvando(false); }
  };

  return (
    <div className="min-h-screen bg-ab-bg flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-ab-accent/5 rounded-full blur-[120px]" />
      </div>
      <div className="relative bg-ab-card border border-ab-border rounded-card w-full max-w-sm p-8 shadow-2xl shadow-black/30">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ab-accent to-ab-teal flex items-center justify-center shadow-lg shadow-ab-accent/25 mx-auto mb-3">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-ab-text">Ativar conta</h1>
          <p className="text-sm text-ab-muted mt-1">Defina sua senha para acessar o painel</p>
        </div>

        {sucesso ? (
          <div className="text-center space-y-3">
            <div className="text-4xl">✅</div>
            <p className="text-ab-text font-medium">Conta ativada com sucesso!</p>
            <p className="text-sm text-ab-muted">Redirecionando para o login...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ab-muted mb-1.5">Nova senha</label>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres" required
                className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ab-muted mb-1.5">Confirmar senha</label>
              <input type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
                placeholder="Repita a senha" required
                className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all" />
            </div>

            {erro && (
              <p className="text-ab-danger text-sm bg-ab-danger/10 border border-ab-danger/20 rounded-input px-3.5 py-2.5">{erro}</p>
            )}

            <button type="submit" disabled={salvando || !token}
              className="w-full bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white rounded-input py-2.5 text-sm font-semibold hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all">
              {salvando ? "Ativando..." : "Ativar conta"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
