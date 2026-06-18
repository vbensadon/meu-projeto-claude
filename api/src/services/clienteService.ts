import { prisma } from "../lib/prisma";
import type { FonteCliente } from "@prisma/client";

const VISITAS_VIP = 10;
const MESES_PERIODO = 12;

export async function upsertCliente(
  tenantId: string,
  nome: string,
  telefone: string,
  fonte: FonteCliente = "whatsapp"
): Promise<void> {
  await prisma.cliente.upsert({
    where: { tenant_id_telefone: { tenant_id: tenantId, telefone } },
    create: { tenant_id: tenantId, nome, telefone, fonte },
    update: { nome }, // atualiza nome em caso de reidentificação
  });
}

export function calcularBadge(visitasNoAno: number): "vip" | "regular" | "novo" {
  if (visitasNoAno > VISITAS_VIP) return "vip";
  if (visitasNoAno > 0) return "regular";
  return "novo";
}

export async function computarMetricasCliente(tenantId: string, telefone: string) {
  const agendamentos = await prisma.agendamento.findMany({
    where: {
      tenant_id: tenantId,
      cliente_telefone: telefone,
      status: "concluido",
    },
    include: {
      profissional: { select: { id: true, nome: true } },
      servico: { select: { nome: true, preco: true } },
    },
    orderBy: { data_hora: "desc" },
  });

  const totalVisitas = agendamentos.length;
  const ticketMedio =
    totalVisitas > 0
      ? agendamentos.reduce((s, a) => s + Number(a.preco ?? a.servico.preco), 0) / totalVisitas
      : 0;
  const ultimaVisita = agendamentos[0]?.data_hora ?? null;

  const contagemPorProfissional: Record<string, { nome: string; count: number }> = {};
  for (const a of agendamentos) {
    const pid = a.profissional.id;
    if (!contagemPorProfissional[pid]) {
      contagemPorProfissional[pid] = { nome: a.profissional.nome, count: 0 };
    }
    contagemPorProfissional[pid].count++;
  }
  const barbeiroFavorito =
    Object.values(contagemPorProfissional).sort((a, b) => b.count - a.count)[0] ?? null;

  const inicioAno = new Date();
  inicioAno.setMonth(inicioAno.getMonth() - MESES_PERIODO);
  const visitasNoAno = agendamentos.filter((a) => a.data_hora >= inicioAno).length;

  return { totalVisitas, ticketMedio, ultimaVisita, barbeiroFavorito, badge: calcularBadge(visitasNoAno) };
}
