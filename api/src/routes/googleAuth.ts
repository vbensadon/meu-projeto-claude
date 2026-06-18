import { Router, type Request, type Response } from "express";
import { gerarUrlAutorizacao, trocarCodigoPorTokens } from "../lib/googleAuth";
import { autenticar } from "../middlewares/auth";

const router = Router();

// GET /api/google/autorizar — redireciona para consent screen do Google
router.get("/autorizar", autenticar, (req: Request, res: Response) => {
  const tenantId = (req as Request & { tenantId: string }).tenantId;
  const url = gerarUrlAutorizacao(tenantId);
  res.redirect(url);
});

// GET /api/google/callback — recebe o código e troca por tokens
router.get("/callback", async (req: Request, res: Response): Promise<void> => {
  const { code, state: tenantId } = req.query as { code: string; state: string };

  if (!code || !tenantId) {
    res.status(400).json({ erro: "Parâmetros inválidos." });
    return;
  }

  try {
    await trocarCodigoPorTokens(tenantId, code);
    res.redirect(`${process.env.FRONTEND_URL ?? "http://localhost:5173"}/configuracoes?google=ok`);
  } catch (err) {
    console.error("[GoogleAuth] Erro ao trocar código:", err);
    res.redirect(`${process.env.FRONTEND_URL ?? "http://localhost:5173"}/configuracoes?google=erro`);
  }
});

export default router;
