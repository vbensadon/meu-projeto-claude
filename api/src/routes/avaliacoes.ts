import { Router, type Response } from "express";
import { prisma } from "../lib/prisma";
import { autenticar } from "../middlewares/auth";

const router = Router();
router.use(autenticar);

router.get("/resumo", async (req, res: Response): Promise<void> => {
  const { tenantId } = req;

  const avaliacoes = await prisma.avaliacao.findMany({
    where: { tenant_id: tenantId },
    include: {
      profissional: { select: { id: true, nome: true } },
      agendamento: { select: { cliente_nome: true, data_hora: true } },
    },
    orderBy: { created_at: "desc" },
  });

  const mapaProf: Record<string, {
    id: string; nome: string;
    notas: number[]; comentarios: { nota: number; comentario: string | null; cliente: string; data: Date }[];
  }> = {};

  for (const a of avaliacoes) {
    const pid = a.profissional.id;
    if (!mapaProf[pid]) {
      mapaProf[pid] = { id: pid, nome: a.profissional.nome, notas: [], comentarios: [] };
    }
    mapaProf[pid].notas.push(a.nota);
    if (a.comentario) {
      mapaProf[pid].comentarios.push({
        nota: a.nota,
        comentario: a.comentario,
        cliente: a.agendamento.cliente_nome,
        data: a.agendamento.data_hora,
      });
    }
  }

  const resumo = Object.values(mapaProf).map((p) => {
    const media = p.notas.reduce((s, n) => s + n, 0) / p.notas.length;
    const distribuicao: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const n of p.notas) distribuicao[n] = (distribuicao[n] ?? 0) + 1;
    return {
      profissional: { id: p.id, nome: p.nome },
      media: Math.round(media * 10) / 10,
      total: p.notas.length,
      distribuicao,
      comentariosRecentes: p.comentarios.slice(0, 10),
    };
  }).sort((a, b) => b.media - a.media);

  res.json({ resumo });
});

export default router;
