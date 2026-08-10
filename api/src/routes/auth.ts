import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";

const router = Router();

const LoginSchema = z.object({
  slug: z.string().min(1),
  senha: z.string().min(1),
});

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const { slug, senha } = parsed.data;

  const tenant = await prisma.tenant.findUnique({ where: { slug, ativo: true } });

  // Tempo constante para evitar timing attack
  const senhaValida = tenant
    ? await bcrypt.compare(senha, tenant.senha_hash)
    : await bcrypt.compare(senha, "$2b$10$placeholder.hash.para.evitar.timing.attack");

  if (!tenant || !senhaValida) {
    res.status(401).json({ erro: "Credenciais inválidas." });
    return;
  }

  const token = jwt.sign(
    { tenantId: tenant.id, slug: tenant.slug },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    tenant: { id: tenant.id, nome: tenant.nome, slug: tenant.slug, plano: tenant.plano },
  });
});

// Login de sub-usuário (email + slug do tenant + senha)
const LoginUsuarioSchema = z.object({
  email: z.string().email(),
  slug: z.string().min(1),
  senha: z.string().min(1),
});

router.post("/login-usuario", async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const { email, slug, senha } = parsed.data;
  const tenant = await prisma.tenant.findUnique({ where: { slug, ativo: true } });
  if (!tenant) { res.status(401).json({ erro: "Credenciais inválidas." }); return; }

  const usuario = await prisma.usuario.findUnique({
    where: { tenant_id_email: { tenant_id: tenant.id, email } },
  });

  const senhaValida = usuario
    ? await bcrypt.compare(senha, usuario.senha_hash)
    : await bcrypt.compare(senha, "$2b$10$placeholder.hash.para.evitar.timing.attack");

  if (!usuario || !senhaValida || !usuario.ativo) {
    res.status(401).json({ erro: "Credenciais inválidas." });
    return;
  }

  const token = jwt.sign(
    {
      tenantId: tenant.id,
      slug: tenant.slug,
      usuarioId: usuario.id,
      role: usuario.role,
      profissionalId: usuario.profissional_id ?? undefined,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    tenant: { id: tenant.id, nome: tenant.nome, slug: tenant.slug, plano: tenant.plano },
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role, profissionalId: usuario.profissional_id },
  });
});

// Ativar conta via invite token (público)
router.post("/ativar-conta", async (req: Request, res: Response): Promise<void> => {
  const { token, senha } = req.body as { token?: string; senha?: string };
  if (!token || !senha || senha.length < 6) {
    res.status(400).json({ erro: "Token e senha (mín. 6 caracteres) obrigatórios." });
    return;
  }

  const usuario = await prisma.usuario.findFirst({ where: { invite_token: token } });
  if (!usuario) { res.status(404).json({ erro: "Token inválido ou já utilizado." }); return; }

  const senhaHash = await bcrypt.hash(senha, 10);
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senha_hash: senhaHash, invite_token: null, ativo: true },
  });

  res.json({ mensagem: "Conta ativada com sucesso." });
});

// Me — retorna dados do usuário atual a partir do token
router.get("/me", autenticar, async (req: Request, res: Response): Promise<void> => {
  const base = {
    role: req.role,
    isImpersonation: req.isImpersonation ?? false,
    impersonatedBy: req.impersonatedBy,
  };
  if (req.usuarioId) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuarioId },
      select: { id: true, nome: true, email: true, role: true, profissional_id: true },
    });
    res.json({ ...base, usuario });
  } else {
    res.json({ ...base, usuario: null });
  }
});

export default router;
