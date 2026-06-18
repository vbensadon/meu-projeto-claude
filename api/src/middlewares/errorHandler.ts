import { type Request, type Response, type NextFunction } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[API] Erro não tratado:", err);

  // Erros do Prisma
  if (err instanceof Error && err.message.includes("RecordNotFound")) {
    res.status(404).json({ erro: "Registro não encontrado." });
    return;
  }

  res.status(500).json({ erro: "Erro interno do servidor." });
}
