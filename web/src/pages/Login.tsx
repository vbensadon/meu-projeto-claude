import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function LogoGrande() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ab-accent to-ab-teal flex items-center justify-center shadow-lg shadow-ab-accent/25">
        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold bg-gradient-to-r from-ab-accent to-ab-teal bg-clip-text text-transparent">
        AgendaBot
      </h1>
      <p className="text-ab-muted text-sm">Painel do estabelecimento</p>
    </div>
  );
}

export default function Login() {
  const [modo, setModo] = useState<"dono" | "usuario">("dono");

  // dono
  const [slug, setSlug] = useState("");
  const [senha, setSenha] = useState("");

  // usuário
  const [email, setEmail] = useState("");
  const [slugUsuario, setSlugUsuario] = useState("");
  const [senhaUsuario, setSenhaUsuario] = useState("");

  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const { login, loginUsuario } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      if (modo === "dono") {
        await login(slug, senha);
      } else {
        await loginUsuario(email, slugUsuario, senhaUsuario);
      }
      navigate("/dashboard");
    } catch {
      setErro(modo === "dono" ? "Estabelecimento ou senha inválidos." : "Credenciais inválidas.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen bg-ab-bg flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-ab-accent/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative bg-ab-card border border-ab-border rounded-card w-full max-w-sm p-8 shadow-2xl shadow-black/30">
        <div className="text-center mb-6">
          <LogoGrande />
        </div>

        <div className="flex gap-1 bg-ab-bg rounded-input p-1 border border-ab-border mb-6">
          {[{ k: "dono" as const, l: "Proprietário" }, { k: "usuario" as const, l: "Membro da equipe" }].map(({ k, l }) => (
            <button
              key={k} type="button"
              onClick={() => { setModo(k); setErro(""); }}
              className={`flex-1 py-1.5 text-xs rounded-input font-medium transition-all ${modo === k ? "bg-ab-accent text-white" : "text-ab-muted hover:text-ab-text"}`}
            >
              {l}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {modo === "dono" ? (
            <>
              <div>
                <label className="block text-sm font-medium text-ab-muted mb-1.5">Identificador do estabelecimento</label>
                <input id="login-slug" type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
                  placeholder="ex: barbearia-silva" required
                  className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ab-muted mb-1.5">Senha</label>
                <input id="login-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required
                  className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-ab-muted mb-1.5">Identificador do estabelecimento</label>
                <input type="text" value={slugUsuario} onChange={(e) => setSlugUsuario(e.target.value)}
                  placeholder="ex: barbearia-silva" required
                  className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ab-muted mb-1.5">E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ab-muted mb-1.5">Senha</label>
                <input type="password" value={senhaUsuario} onChange={(e) => setSenhaUsuario(e.target.value)} required
                  className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200" />
              </div>
            </>
          )}

          {erro && (
            <p className="text-ab-danger text-sm bg-ab-danger/10 border border-ab-danger/20 rounded-input px-3.5 py-2.5">
              {erro}
            </p>
          )}

          <button id="login-submit" type="submit" disabled={carregando}
            className="w-full bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white rounded-input py-2.5 text-sm font-semibold hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200">
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
