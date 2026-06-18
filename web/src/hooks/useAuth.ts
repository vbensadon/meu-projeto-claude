import { useState } from "react";
import { api } from "../lib/api";
import type { RoleUsuario } from "../lib/types";

interface UsuarioAuth {
  id: string;
  nome: string;
  email: string;
  role: RoleUsuario;
  profissionalId: string | null;
}

interface AuthState {
  token: string | null;
  tenant: { id: string; nome: string; slug: string; plano: string } | null;
  role: RoleUsuario;
  usuario: UsuarioAuth | null;
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({
    token: localStorage.getItem("token"),
    tenant: JSON.parse(localStorage.getItem("tenant") ?? "null"),
    role: (localStorage.getItem("role") as RoleUsuario) ?? "dono",
    usuario: JSON.parse(localStorage.getItem("usuario") ?? "null"),
  });

  const login = async (slug: string, senha: string) => {
    const { data } = await api.post("/auth/login", { slug, senha });
    localStorage.setItem("token", data.token);
    localStorage.setItem("tenant", JSON.stringify(data.tenant));
    localStorage.setItem("role", "dono");
    localStorage.removeItem("usuario");
    setAuth({ token: data.token, tenant: data.tenant, role: "dono", usuario: null });
    return data;
  };

  const loginUsuario = async (email: string, slug: string, senha: string) => {
    const { data } = await api.post("/auth/login-usuario", { email, slug, senha });
    localStorage.setItem("token", data.token);
    localStorage.setItem("tenant", JSON.stringify(data.tenant));
    localStorage.setItem("role", data.usuario.role);
    localStorage.setItem("usuario", JSON.stringify(data.usuario));
    setAuth({ token: data.token, tenant: data.tenant, role: data.usuario.role, usuario: data.usuario });
    return data;
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("tenant");
    localStorage.removeItem("role");
    localStorage.removeItem("usuario");
    setAuth({ token: null, tenant: null, role: "dono", usuario: null });
  };

  const podeAcessar = (...roles: RoleUsuario[]) => roles.includes(auth.role);

  return { ...auth, login, loginUsuario, logout, autenticado: !!auth.token, podeAcessar };
}
