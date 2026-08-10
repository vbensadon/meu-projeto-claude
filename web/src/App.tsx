import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PrivateRoute from "./components/PrivateRoute";
import RequireRole from "./components/RequireRole";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import AtivarConta from "./pages/AtivarConta";
import SemPermissao from "./pages/SemPermissao";
import Dashboard from "./pages/Dashboard";
import Profissionais from "./pages/Profissionais";
import Servicos from "./pages/Servicos";
import Agenda from "./pages/Agenda";
import ListaEspera from "./pages/ListaEspera";
import Clientes from "./pages/Clientes";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import ClientesInativos from "./pages/ClientesInativos";
import Avaliar from "./pages/Avaliar";
import Avaliacoes from "./pages/Avaliacoes";
import Campanhas from "./pages/Campanhas";
import Comissoes from "./pages/Comissoes";
import Equipe from "./pages/Equipe";
import ConfigBot from "./pages/ConfigBot";
import MensagensInterativas from "./pages/MensagensInterativas";
import Configuracoes from "./pages/Configuracoes";
import PlatformPrivateRoute from "./components/platform/PlatformPrivateRoute";
import PlatformLayout from "./components/platform/PlatformLayout";
import PlatformLogin from "./pages/platform/PlatformLogin";
import PlatformDashboard from "./pages/platform/PlatformDashboard";
import PlatformTenants from "./pages/platform/PlatformTenants";
import PlatformTenantNew from "./pages/platform/PlatformTenantNew";
import PlatformTenantDetail from "./pages/platform/PlatformTenantDetail";
import PlatformTenantFeatures from "./pages/platform/PlatformTenantFeatures";
import PlatformPlans from "./pages/platform/PlatformPlans";
import PlatformAudit from "./pages/platform/PlatformAudit";
import PlatformAlerts from "./pages/platform/PlatformAlerts";
import PlatformAlertChannels from "./pages/platform/PlatformAlertChannels";
import PlatformConversations from "./pages/platform/PlatformConversations";
import PlatformWebhookEvents from "./pages/platform/PlatformWebhookEvents";
import PlatformOnboarding from "./pages/platform/PlatformOnboarding";

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
