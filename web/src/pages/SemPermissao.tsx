import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function SemPermissao() {
  const navigate = useNavigate();
  const { role } = useAuth();

  return (
    <div className="min-h-screen bg-ab-bg flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-6xl">🔒</div>
        <h1 className="text-2xl font-bold text-ab-text">Sem permissão</h1>
        <p className="text-ab-muted">
          Seu perfil <strong className="text-ab-text">({role})</strong> não tem acesso a esta página.
        </p>
        <button
          onClick={() => navigate("/agenda")}
          className="px-6 py-2.5 bg-ab-accent text-white rounded-input text-sm font-medium hover:bg-ab-accent-hover transition-colors"
        >
          Ir para a agenda
        </button>
      </div>
    </div>
  );
}
