import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function decodeJwt(token: string): any {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return null; }
}

export default function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { autenticado } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const impersonationToken = searchParams.get("impersonation_token");

  useEffect(() => {
    if (impersonationToken) {
      const payload = decodeJwt(impersonationToken);
      if (payload?.isImpersonation) {
        localStorage.setItem("token", impersonationToken);
        if (payload.tenantId) {
          localStorage.setItem("tenant", JSON.stringify({ id: payload.tenantId, slug: payload.slug, nome: "Sessão de suporte", plano: "pro" }));
        }
        localStorage.setItem("role", "dono");
        localStorage.removeItem("usuario");
        setSearchParams({});
        window.location.reload();
      }
    }
  }, [impersonationToken]);

  if (impersonationToken) return null; // aguarda o redirect

  return autenticado ? <>{children}</> : <Navigate to="/login" replace />;
}
