import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { autenticar, requireRole } from "../middlewares/auth";

const router = Router();
router.use(autenticar, requireRole("dono"));

// GET / — lista templates do tenant
router.get("/", async (req, res) => {
  try {
    const templates = await prisma.whatsAppTemplate.findMany({
      where: { tenant_id: req.tenantId },
      orderBy: { created_at: "asc" },
    });
    res.json(templates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao buscar templates." });
  }
});

const schemaUpsert = z.object({
  chave: z.enum(["lembrete_24h", "vaga_fila_espera"]),
  content_sid: z.string().regex(/^HX[a-f0-9]{32}$/, "Content SID inválido (deve começar com HX seguido de 32 caracteres hex)"),
  status: z.enum(["pendente", "aprovado", "rejeitado"]).optional(),
  variaveis: z.record(z.string()).optional(),
});

// POST / — cria ou atualiza um template
router.post("/", async (req, res) => {
  const parsed = schemaUpsert.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  try {
    const tmpl = await prisma.whatsAppTemplate.upsert({
      where: { tenant_id_chave: { tenant_id: req.tenantId, chave: parsed.data.chave } },
      update: {
        content_sid: parsed.data.content_sid,
        status: (parsed.data.status as any) ?? "pendente",
        variaveis: (parsed.data.variaveis ?? {}) as any,
      },
      create: {
        tenant_id: req.tenantId,
        chave: parsed.data.chave,
        content_sid: parsed.data.content_sid,
        status: (parsed.data.status as any) ?? "pendente",
        variaveis: (parsed.data.variaveis ?? {}) as any,
      },
    });
    res.json(tmpl);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao salvar template." });
  }
});

export default router;
