import { Router, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { autenticar, requireRole } from "../middlewares/auth";

const router = Router();
router.use(autenticar);

const ROLES_ADMIN = ["dono", "gerente"];

// Listar usuários do tenant
router.get("/", async (req, res: Response): Promise<void> => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { tenant_id: req.tenantId },
      select: {
        id: true, nome: true, email: true, role: true, ativo: true, created_at: true,
        profissional: { select: { id: true, nome: true } },
        invite_token: true,
      },
      orderBy: { created_at: "asc" },
    });
    // Expõe se há convite pendente sem revelar o token
    const resultado = usuarios.map(({ invite_token, ...u }) => ({
      ...u,
      convite_pendente: !!invite_token,
    }));
    res.json({ usuarios: resultado });
  } catch (err) {
    console.error("[Usuarios] Erro ao listar:", err);
    res.status(500).json({ erro: "Erro ao listar usuários." });
  }
});

// Convidar usuário (gera invite_token e retorna link)
const ConvidarSchema = z.object({
  nome: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["gerente", "recepcionista", "barbeiro"]),
  profissional_id: z.string().optional().nullable(),
});

router.post("/convidar", requireRole(...ROLES_ADMIN), async (req, res: Response): Promise<void> => {
  const parsed = ConvidarSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() }); return; }

  const { nome, email, role, profissional_id } = parsed.data;

  if (profissional_id) {
    const prof = await prisma.profissional.findFirst({ where: { id: profissional_id, tenant_id: req.tenantId } });
    if (!prof) { res.status(404).json({ erro: "Profissional não encontrado." }); return; }
  }

  try {
    const token = randomBytes(32).toString("hex");
    const placeholder = await bcrypt.hash("placeholder_" + token, 1);

    const usuario = await prisma.usuario.upsert({
      where: { tenant_id_email: { tenant_id: req.tenantId, email } },
      update: { nome, role, profissional_id: profissional_id ?? null, invite_token: token, ativo: false },
      create: {
        tenant_id: req.tenantId, nome, email, role,
        senha_hash: placeholder,
        profissional_id: profissional_id ?? null,
        invite_token: token, ativo: false,
      },
      select: { id: true, nome: true, email: true, role: true },
    });

    const appUrl = process.env.APP_URL ?? "http://localhost:5173";
    const link = `${appUrl}/ativar-conta?token=${token}`;

    res.status(201).json({ usuario, link });
  } catch (err) {
    console.error("[Usuarios] Erro ao convidar:", err);
    res.status(500).json({ erro: "Erro ao criar convite." });
  }
});

// Alterar role
router.patch("/:id/role", requireRole(...ROLES_ADMIN), async (req, res: Response): Promise<void> => {
  const { role } = req.body as { role?: string };
  const rolesValidos = ["gerente", "recepcionista", "barbeiro"];
  if (!role || !rolesValidos.includes(role)) {
    res.status(400).json({ erro: "Role inválido. Use: gerente, recepcionista ou barbeiro." });
    return;
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!usuario || usuario.tenant_id !== req.tenantId) {
    res.status(404).json({ erro: "Usuário não encontrado." });
    return;
  }

  const atualizado = await prisma.usuario.update({
    where: { id: req.params.id },
    data: { role: role as "gerente" | "recepcionista" | "barbeiro" },
    select: { id: true, nome: true, role: true },
  });
  res.json({ usuario: atualizado });
});

// Desativar / reativar
router.patch("/:id/status", requireRole(...ROLES_ADMIN), async (req, res: Response): Promise<void> => {
  const { ativo } = req.body as { ativo?: boolean };
  if (typeof ativo !== "boolean") { res.status(400).json({ erro: "Campo 'ativo' (boolean) obrigatório." }); return; }

  const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!usuario || usuario.tenant_id !== req.tenantId) {
    res.status(404).json({ erro: "Usuário não encontrado." });
    return;
  }

  const atualizado = await prisma.usuario.update({
    where: { id: req.params.id },
    data: { ativo },
    select: { id: true, nome: true, ativo: true },
  });
  res.json({ usuario: atualizado });
});

export default router;
