import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { RoleUsuario } from "../lib/types";

interface NavItem {
  to: string;
  label: string;
  roles?: RoleUsuario[]; // undefined = todos os roles
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    roles: ["dono", "gerente"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2v8H3zm6-4h2v12H9zm6-3h2v15h-2zm6-4h2v19h-2z" />
      </svg>
    ),
  },
  {
    to: "/agenda",
    label: "Agenda",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: "/profissionais",
    label: "Profissionais",
    roles: ["dono", "gerente", "recepcionista"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    to: "/servicos",
    label: "Serviços",
    roles: ["dono", "gerente", "recepcionista"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121A3 3 0 109.88 9.88m4.242 4.242L9.88 9.88m4.242 4.242L20 20M9.88 9.88L4 4m0 0h4m-4 0v4" />
      </svg>
    ),
  },
  {
    to: "/clientes",
    label: "Clientes",
    roles: ["dono", "gerente", "recepcionista"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4-4a4 4 0 100-8 4 4 0 000 8zm6 0a3 3 0 100-6 3 3 0 000 6zM3 20v-2a3 3 0 013-3" />
      </svg>
    ),
  },
  {
    to: "/avaliacoes",
    label: "Avaliações",
    roles: ["dono", "gerente"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
  {
    to: "/campanhas",
    label: "Campanhas",
    roles: ["dono", "gerente", "recepcionista"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
    ),
  },
  {
    to: "/clientes/inativos",
    label: "Inativos",
    roles: ["dono", "gerente", "recepcionista"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728A9 9 0 015.636 5.636" />
      </svg>
    ),
  },
  {
    to: "/fila-espera",
    label: "Fila de Espera",
    roles: ["dono", "gerente", "recepcionista"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: "/comissoes",
    label: "Comissões",
    roles: ["dono", "gerente"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 12v-2m9-4a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: "/configuracoes/bot",
    label: "Config. Bot",
    roles: ["dono"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
      </svg>
    ),
  },
  {
    to: "/configuracoes/equipe",
    label: "Equipe",
    roles: ["dono", "gerente"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    roles: ["dono", "gerente"],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function LogoAgendaBot() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ab-accent to-ab-teal flex items-center justify-center">
        <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <span className="text-lg font-bold bg-gradient-to-r from-ab-accent to-ab-teal bg-clip-text text-transparent">
        AgendaBot
      </span>
    </div>
  );
}

function SidebarConteudo({ onNavigate }: { onNavigate?: () => void }) {
  const { tenant, usuario, role, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navFiltrado = NAV.filter((item) => !item.roles || item.roles.includes(role as RoleUsuario));
  const nomeExibido = usuario?.nome ?? tenant?.nome ?? "?";
  const subtituloExibido = usuario ? `${role} · ${tenant?.slug ?? ""}` : (tenant?.slug ?? "");

  return (
    <>
      <div className="p-5 mb-2">
        <LogoAgendaBot />
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navFiltrado.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            end={to === "/configuracoes"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-input text-sm transition-all duration-200 ${
                isActive
                  ? "bg-ab-accent/15 text-ab-accent font-medium border-l-2 border-ab-accent -ml-px"
                  : "text-ab-muted hover:bg-ab-hover hover:text-ab-text"
              }`
            }
          >
            {icon}
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-ab-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ab-accent to-ab-accent-hover flex items-center justify-center text-white text-sm font-semibold shrink-0">
            {nomeExibido.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ab-text truncate">{nomeExibido}</p>
            <p className="text-xs text-ab-muted truncate">{subtituloExibido}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full mt-1 flex items-center gap-2 px-3 py-2 text-sm text-ab-muted hover:text-ab-danger hover:bg-ab-danger/10 rounded-input transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sair
        </button>
      </div>
    </>
  );
}

export default function Layout() {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="flex h-screen bg-ab-bg">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-60 bg-ab-card flex-col shadow-xl shadow-black/20">
        <SidebarConteudo />
      </aside>

      {/* Drawer mobile/tablet */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuAberto(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-ab-card flex flex-col shadow-xl shadow-black/40">
            <SidebarConteudo onNavigate={() => setMenuAberto(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar mobile/tablet */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-ab-card border-b border-ab-border shrink-0">
          <button
            onClick={() => setMenuAberto(true)}
            className="p-1.5 -ml-1.5 text-ab-muted hover:text-ab-text transition-colors duration-150"
            aria-label="Abrir menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <LogoAgendaBot />
        </header>

        {/* Main */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
