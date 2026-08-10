import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { autenticarPlataforma } from "../../middlewares/platformAuth";

const router = Router();

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ erro: "Email e senha obrigatórios." });
    return;
  }

  const user = await prisma.platformUser.findUnique({ where: { email } });

  if (!user || !user.active) {
    res.status(401).json({ erro: "Credenciais inválidas." });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ erro: "Credenciais inválidas." });
    return;
  }

  const token = jwt.sign(
    {
      isPlatformUser: true,
      platformUserId: user.id,
      platformRole: user.role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

router.get("/me", autenticarPlataforma, async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.platformUser.findUnique({
    where: { id: req.platformUserId! },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  if (!user) {
    res.status(404).json({ erro: "Usuário não encontrado." });
    return;
  }

  res.json(user);
});

export default router;
