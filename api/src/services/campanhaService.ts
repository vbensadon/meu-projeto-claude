import { prisma } from "../lib/prisma";
import { enviarMensagem } from "./twilioService";

const RATE_LIMIT_MS = 6000; // ~10/min

export type Segmento = "todos" | "inativos_30" | "inativos_60" | "aniversariantes_mes" | "vip";

interface ClienteAlvo {
  id: string;
  nome: string;
  telefone: string;
}

export async function resolverSegmento(tenantId: string, segmento: Segmento): Promise<ClienteAlvo[]> {
  const clientes = await prisma.cliente.findMany({
    where: { tenant_id: tenantId },
    select: { id: true, nome: true, telefone: true, aniversario: true },
  });

  if (segmento === "todos") {
    return clientes.map(({ id, nome, telefone }) => ({ id, nome, telefone }));
  }

  if (segmento === "aniversariantes_mes") {
    const mesAtual = new Date().getMonth() + 1;
    return clientes
      .filter((c) => c.aniversario && new Date(c.aniversario).getMonth() + 1 === mesAtual)
      .map(({ id, nome, telefone }) => ({ id, nome, telefone }));
  }

  const dias = segmento === "inativos_30" ? 30 : segmento === "inativos_60" ? 60 : null;
  const inicioAno = new Date();
  inicioAno.setFullYear(inicioAno.getFullYear() - 1);

  if (dias !== null || segmento === "vip") {
    const telefones = clientes.map((c) => c.telefone);
    const agendamentos = await prisma.agendamento.findMany({
      where: { tenant_id: tenantId, cliente_telefone: { in: telefones }, status: "concluido" },
      select: { cliente_telefone: true, data_hora: true },
      orderBy: { data_hora: "desc" },
    });

    const ultimoPorTel: Record<string, Date> = {};
    const visitasAno: Record<string, number> = {};
    for (const a of agendamentos) {
      if (!ultimoPorTel[a.cliente_telefone]) ultimoPorTel[a.cliente_telefone] = a.data_hora;
      if (a.data_hora >= inicioAno) visitasAno[a.cliente_telefone] = (visitasAno[a.cliente_telefone] ?? 0) + 1;
    }

    const corte = new Date();
    corte.setDate(corte.getDate() - (dias ?? 0));

    return clientes
      .filter((c) => {
        if (segmento === "vip") return (visitasAno[c.telefone] ?? 0) > 10;
        const ultimo = ultimoPorTel[c.telefone];
        return !ultimo || ultimo < corte;
      })
      .map(({ id, nome, telefone }) => ({ id, nome, telefone }));
  }

  return [];
}

export async function contarSegmento(tenantId: string, segmento: Segmento): Promise<number> {
  return (await resolverSegmento(tenantId, segmento)).length;
}

export async function executarCampanha(campanhaId: string): Promise<void> {
  const campanha = await prisma.campanha.findUnique({
    where: { id: campanhaId },
    include: { tenant: true },
  });
  if (!campanha) return;
  if (campanha.status === "enviando" || campanha.status === "concluida") return;

  await prisma.campanha.update({ where: { id: campanhaId }, data: { status: "enviando" } });

  const clientes = await resolverSegmento(campanha.tenant_id, campanha.segmento as Segmento);
  const creds = {
    accountSid: campanha.tenant.twilio_account_sid,
    authToken: campanha.tenant.twilio_auth_token,
    numeroOrigem: campanha.tenant.telefone_whatsapp,
  };

  let totalEnviados = 0;
  let totalFalhas = 0;

  for (const cliente of clientes) {
    const texto = campanha.mensagem
      .replace(/\{nome\}/g, cliente.nome);

    let status = "enviado";
    let erro: string | undefined;
    try {
      await enviarMensagem(creds, cliente.telefone, texto);
      totalEnviados++;
    } catch (err) {
      status = "falhou";
      erro = String(err instanceof Error ? err.message : err).slice(0, 500);
      totalFalhas++;
    }

    await prisma.logCampanha.create({
      data: {
        tenant_id: campanha.tenant_id,
        cliente_id: cliente.id,
        campanha_id: campanhaId,
        mensagem: texto,
        status,
        erro: erro ?? null,
      },
    });

    await prisma.campanha.update({
      where: { id: campanhaId },
      data: { total_enviados: totalEnviados, total_falhas: totalFalhas },
    });

    if (totalEnviados + totalFalhas < clientes.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  await prisma.campanha.update({
    where: { id: campanhaId },
    data: { status: totalFalhas === clientes.length ? "falhou" : "concluida", enviado_em: new Date() },
  });
}
