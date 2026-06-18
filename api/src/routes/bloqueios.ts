import { randomUUID } from "crypto";
import { Router, type Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";

const router = Router();
router.use(autenticar);

const LIMITE_RECORRENCIA_DIAS = 90;

const QuerySchema = z.object({
  profissional_id: z.string().optional(),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const BloqueioSchema = z
  .object({
    profissional_id: z.string().min(1),
    titulo: z.string().min(1).max(150),
    inicio: z.string().datetime(),
    fim: z.string().datetime(),
    recorrencia: z.enum(["diario", "semanal"]).optional(),
  })
  .refine((d) => new Date(d.fim) > new Date(d.inicio), {
    message: "O fim deve ser depois do início.",
  });

router.get("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ erro: "Query inválida.", detalhes: parsed.error.flatten() });
    return;
  }

  const { profissional_id, data_inicio, data_fim } = parsed.data;

  const where: Prisma.BloqueioWhereInput = {
    tenant_id: tenantId,
    ...(profissional_id && { profissional_id }),
    ...(data_inicio || data_fim
      ? {
          ...(data_fim && { inicio: { lte: new Date(`${data_fim}T23:59:59`) } }),
          ...(data_inicio && { fim: { gte: new Date(`${data_inicio}T00:00:00`) } }),
        }
      : { fim: { gte: new Date() } }),
  };

  const bloqueios = await prisma.bloqueio.findMany({
    where,
    include: { profissional: { select: { id: true, nome: true } } },
    orderBy: { inicio: "asc" },
  });

  res.json(bloqueios);
});

router.post("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = BloqueioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const { profissional_id, titulo, inicio, fim, recorrencia } = parsed.data;

  const profissional = await prisma.profissional.findFirst({
    where: { id: profissional_id, tenant_id: tenantId },
  });
  if (!profissional) { res.status(404).json({ erro: "Profissional não encontrado." }); return; }

  const inicioBase = new Date(inicio);
  const fimBase = new Date(fim);
  const duracaoMs = fimBase.getTime() - inicioBase.getTime();
  const passoDias = recorrencia === "diario" ? 1 : recorrencia === "semanal" ? 7 : null;
  const serieId = passoDias ? randomUUID() : null;

  const ocorrencias: { inicio: Date; fim: Date }[] = [];
  if (passoDias === null) {
    ocorrencias.push({ inicio: inicioBase, fim: fimBase });
  } else {
    const limite = new Date(inicioBase.getTime() + LIMITE_RECORRENCIA_DIAS * 86_400_000);
    let cursor = inicioBase;
    while (cursor <= limite) {
      ocorrencias.push({ inicio: cursor, fim: new Date(cursor.getTime() + duracaoMs) });
      cursor = new Date(cursor.getTime() + passoDias * 86_400_000);
    }
  }

  const criados = await prisma.$transaction(
    ocorrencias.map((o) =>
      prisma.bloqueio.create({
        data: {
          tenant_id: tenantId,
          profissional_id,
          titulo,
          inicio: o.inicio,
          fim: o.fim,
          recorrencia: recorrencia ?? null,
          serie_id: serieId,
        },
        include: { profissional: { select: { id: true, nome: true } } },
      })
    )
  );

  res.status(201).json(criados);
});

router.delete("/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;

  const existente = await prisma.bloqueio.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!existente) { res.status(404).json({ erro: "Bloqueio não encontrado." }); return; }

  if (existente.serie_id) {
    const { count } = await prisma.bloqueio.deleteMany({
      where: { tenant_id: tenantId, serie_id: existente.serie_id, inicio: { gte: existente.inicio } },
    });
    res.json({ mensagem: "Bloqueio e recorrências futuras removidos.", removidos: count });
  } else {
    await prisma.bloqueio.delete({ where: { id: existente.id } });
    res.json({ mensagem: "Bloqueio removido.", removidos: 1 });
  }
});

export default router;
