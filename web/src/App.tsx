import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import PrivateRoute from "./components/PrivateRoute";
import RequireRole from "./components/RequireRole";
import Layout from "./components/Layout";
import PlatformPrivateRoute from "./components/platform/PlatformPrivateRoute";
import PlatformLayout from "./components/platform/PlatformLayout";

// Páginas carregadas sob demanda (code-splitting) — reduz o bundle inicial,
// evitando a tela branca longa enquanto baixa/parseia tudo de uma vez.
const Login = lazy(() => import("./pages/Login"));
const AtivarConta = lazy(() => import("./pages/AtivarConta"));
const SemPermissao = lazy(() => import("./pages/SemPermissao"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profissionais = lazy(() => import("./pages/Profissionais"));
const Servicos = lazy(() => import("./pages/Servicos"));
const Agenda = lazy(() => import("./pages/Agenda"));
const ListaEspera = lazy(() => import("./pages/ListaEspera"));
const Clientes = lazy(() => import("./pages/Clientes"));
const ClienteDetalhe = lazy(() => import("./pages/ClienteDetalhe"));
const ClientesInativos = lazy(() => import("./pages/ClientesInativos"));
const Avaliar = lazy(() => import("./pages/Avaliar"));
const Avaliacoes = lazy(() => import("./pages/Avaliacoes"));
const Campanhas = lazy(() => import("./pages/Campanhas"));
const Comissoes = lazy(() => import("./pages/Comissoes"));
const Equipe = lazy(() => import("./pages/Equipe"));
const ConfigBot = lazy(() => import("./pages/ConfigBot"));
const MensagensInterativas = lazy(() => import("./pages/MensagensInterativas"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const PlatformLogin = lazy(() => import("./pages/platform/PlatformLogin"));
const PlatformDashboard = lazy(() => import("./pages/platform/PlatformDashboard"));
const PlatformTenants = lazy(() => import("./pages/platform/PlatformTenants"));
const PlatformTenantNew = lazy(() => import("./pages/platform/PlatformTenantNew"));
const PlatformTenantDetail = lazy(() => import("./pages/platform/PlatformTenantDetail"));
const PlatformTenantFeatures = lazy(() => import("./pages/platform/PlatformTenantFeatures"));
const PlatformPlans = lazy(() => import("./pages/platform/PlatformPlans"));
const PlatformAudit = lazy(() => import("./pages/platform/PlatformAudit"));
const PlatformAlerts = lazy(() => import("./pages/platform/PlatformAlerts"));
const PlatformAlertChannels = lazy(() => import("./pages/platform/PlatformAlertChannels"));
const PlatformConversations = lazy(() => import("./pages/platform/PlatformConversations"));
const PlatformWebhookEvents = lazy(() => import("./pages/platform/PlatformWebhookEvents"));
const PlatformOnboarding = lazy(() => import("./pages/platform/PlatformOnboarding"));

function Carregando() {
  return (
    <div className="h-dvh flex items-center justify-center bg-ab-bg">
      <div className="w-8 h-8 border-2 border-ab-border border-t-ab-accent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Carregando />}>
        <Routes>
          {/* Rotas públicas */}
          <Route path="/login" element={<Login />} />
          <Route path="/ativar-conta" element={<AtivarConta />} />
          <Route path="/avaliar/:agendamentoId/:token" element={<Avaliar />} />
          <Route path="/sem-permissao" element={<SemPermissao />} />

          {/* Painel autenticado */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={
              <RequireRole roles={["dono", "gerente"]}>
                <Dashboard />
              </RequireRole>
            } />
            <Route path="profissionais" element={<Profissionais />} />
            <Route path="servicos" element={<Servicos />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="fila-espera" element={<ListaEspera />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/inativos" element={<ClientesInativos />} />
            <Route path="clientes/:id" element={<ClienteDetalhe />} />
            <Route path="avaliacoes" element={<Avaliacoes />} />
            <Route path="campanhas" element={
              <RequireRole roles={["dono", "gerente", "recepcionista"]}>
                <Campanhas />
              </RequireRole>
            } />
            <Route path="comissoes" element={
              <RequireRole roles={["dono", "gerente"]}>
                <Comissoes />
              </RequireRole>
            } />
            <Route path="configuracoes/equipe" element={
              <RequireRole roles={["dono", "gerente"]}>
                <Equipe />
              </RequireRole>
            } />
            <Route path="configuracoes/mensagens" element={
              <RequireRole roles={["dono"]}>
                <MensagensInterativas />
              </RequireRole>
            } />
            <Route path="configuracoes/bot" element={
              <RequireRole roles={["dono"]}>
                <ConfigBot />
              </RequireRole>
            } />
            <Route path="configuracoes" element={<Configuracoes />} />
          </Route>

          <Route path="*" element={<Navigate to="/agenda" replace />} />

          {/* ── Plataforma (superadmin) ─────────────────────────────── */}
          <Route path="/platform/login" element={<PlatformLogin />} />
          <Route
            path="/platform"
            element={
              <PlatformPrivateRoute>
                <PlatformLayout />
              </PlatformPrivateRoute>
            }
          >
            <Route index element={<Navigate to="/platform/dashboard" replace />} />
            <Route path="dashboard" element={<PlatformDashboard />} />
            <Route path="tenants" element={<PlatformTenants />} />
            <Route path="tenants/new" element={<PlatformTenantNew />} />
            <Route path="tenants/:id" element={<PlatformTenantDetail />} />
            <Route path="tenants/:id/features" element={<PlatformTenantFeatures />} />
            <Route path="plans" element={<PlatformPlans />} />
            <Route path="audit" element={<PlatformAudit />} />
            <Route path="alerts" element={<PlatformAlerts />} />
            <Route path="alerts/channels" element={<PlatformAlertChannels />} />
            <Route path="tenants/:id/conversations" element={<PlatformConversations />} />
            <Route path="webhook-events" element={<PlatformWebhookEvents />} />
            <Route path="onboarding" element={<PlatformOnboarding />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
