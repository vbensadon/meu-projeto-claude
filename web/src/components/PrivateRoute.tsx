import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { autenticado } = useAuth();
  return autenticado ? <>{children}</> : <Navigate to="/login" replace />;
}
