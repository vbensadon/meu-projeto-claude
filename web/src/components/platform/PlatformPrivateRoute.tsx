import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";

export default function PlatformPrivateRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem("platform_token");
  if (!token) return <Navigate to="/platform/login" replace />;
  return <>{children}</>;
}
