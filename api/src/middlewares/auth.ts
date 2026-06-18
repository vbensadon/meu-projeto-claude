import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JwtPayload {
  tenantId: string;
  slug?: string;
  // campos presentes apenas em tokens de sub-usuário
  usuarioId?: string;
  role?: string;
  profissionalId?: string;
}

declare global {
  namespace Express {
    interface Request {
      tenantId: string;
      slug: string;
      usuarioId?: string;
      role: string;         // "dono" por padrão (token de tenant)
      profissionalId?: string;
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
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.tenantId = payload.tenantId;
    req.slug = payload.slug ?? "";
    req.usuarioId = payload.usuarioId;
    req.role = payload.role ?? "dono";
    req.profissionalId = payload.profissionalId;
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
