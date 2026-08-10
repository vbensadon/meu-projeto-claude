import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

interface PlatformJwtPayload {
  isPlatformUser: true;
  platformUserId: string;
  platformRole: string;
}

declare global {
  namespace Express {
    interface Request {
      platformUserId?: string;
      platformRole?: string;
    }
  }
}

export function autenticarPlataforma(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ erro: "Token não fornecido." });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as PlatformJwtPayload;
    if (!payload.isPlatformUser) {
      res.status(401).json({ erro: "Token inválido para rotas de plataforma." });
      return;
    }
    req.platformUserId = payload.platformUserId;
    req.platformRole = payload.platformRole;
    next();
  } catch {
    res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}

export function requirePlatformRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.platformRole || !roles.includes(req.platformRole)) {
      res.status(403).json({ erro: "Sem permissão para esta operação." });
      return;
    }
    next();
  };
}
