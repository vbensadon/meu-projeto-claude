import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { RoleUsuario } from "../lib/types";

interface Props {
  roles: RoleUsuario[];
  children: React.ReactNode;
}

export default function RequireRole({ roles, children }: Props) {
  const { autenticado, role } = useAuth();
  if (!autenticado) return <Navigate to="/login" replace />;
  if (!roles.includes(role as RoleUsuario)) return <Navigate to="/sem-permissao" replace />;
  return <>{children}</>;
}
