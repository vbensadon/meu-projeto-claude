import { Router, type Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";
import { adicionarNaFila } from "../services/listaEsperaService";

const router = Router();
router.use(autenticar);

const QuerySchema = z.object({
  profissional_id: z.string().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ erro: "Query inválida.", detalhes: parsed.error.flatten() });
    return;
  }

  const { profissional_id, data } = parsed.data;

  const where: Prisma.ListaEsperaWhereInput = {
    tenant_id: tenantId,
    ...(profissional_id && { profissional_id }),
    ...(data && {
      data_desejada: { gte: new Date(`${data}T00:00:00`), lte: new Date(`${data}T23:59:59`) },
    }),
  };

  const fila = await prisma.listaEspera.findMany({
    where,
    include: {
      profissional: { select: { id: true, nome: true } },
      servico: { select: { id: true, nome: true } },
    },
    orderBy: { created_at: "asc" },
  });

  res.json(fila);
});

const ListaEsperaSchema = z.object({
  profissional_id: z.string().min(1).nullable().optional(),
  servico_id: z.string().min(1),
  cliente_nome: z.string().min(1).max(150),
  cliente_telefone: z.string().min(1),
  data_desejada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post("/", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;
  const parsed = ListaEsperaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten() });
    return;
  }

  const { profissional_id, servico_id, cliente_nome, cliente_telefone, data_desejada } = parsed.data;

  const servico = await prisma.servico.findFirst({ where: { id: servico_id, tenant_id: tenantId } });
  if (!servico) { res.status(404).json({ erro: "Serviço não encontrado." }); return; }

  if (profissional_id) {
    const profissional = await prisma.profissional.findFirst({
      where: { id: profissional_id, tenant_id: tenantId },
    });
    if (!profissional) { res.status(404).json({ erro: "Profissional não encontrado." }); return; }
  }

  const entrada = await adicionarNaFila({
    tenantId,
    clienteNome: cliente_nome,
    clienteTelefone: cliente_telefone,
    profissionalId: profissional_id ?? null,
    servicoId: servico_id,
    dataDesejada: new Date(`${data_desejada}T00:00:00`),
  });

  res.status(201).json(entrada);
});

router.delete("/:id", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;

  const existente = await prisma.listaEspera.findFirst({
    where: { id: req.params.id, tenant_id: tenantId },
  });
  if (!existente) { res.status(404).json({ erro: "Entrada não encontrada." }); return; }

  await prisma.listaEspera.delete({ where: { id: existente.id } });

  res.json({ mensagem: "Removido da fila de espera." });
});

export default router;
