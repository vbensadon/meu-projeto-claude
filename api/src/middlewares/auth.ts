import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JwtPayload {
  tenantId: string;
  slug?: string;
  usuarioId?: string;
  role?: string;
  profissionalId?: string;
  isPlatformUser?: boolean;
  isImpersonation?: boolean;
  impersonatedBy?: string;
}

declare global {
  namespace Express {
    interface Request {
      tenantId: string;
      slug: string;
      usuarioId?: string;
      role: string;
      profissionalId?: string;
      isImpersonation?: boolean;
      impersonatedBy?: string;
    }
  }
}

export function autenticar(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ erro: "Token não fornecido." });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload & { isPlatformUser?: boolean };
    if (payload.isPlatformUser) {
      res.status(401).json({ erro: "Token de plataforma não é válido para rotas de tenant." });
      return;
    }
    req.tenantId = payload.tenantId;
    req.slug = payload.slug ?? "";
    req.usuarioId = payload.usuarioId;
    req.role = payload.role ?? "dono";
    req.profissionalId = payload.profissionalId;
    req.isImpersonation = payload.isImpersonation;
    req.impersonatedBy = payload.impersonatedBy;
    next();
  } catch {
    res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.role)) {
      res.status(403).json({ erro: "Sem permissão para acessar este recurso." });
      return;
    }
    next();
  };
}
