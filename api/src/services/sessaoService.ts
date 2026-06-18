import { prisma } from "../lib/prisma";
import type { DadosColetados, Etapa } from "../lib/types";

export async function obterSessao(tenantId: string, clienteTelefone: string) {
  return prisma.sessaoBot.upsert({
    where: { tenant_id_cliente_telefone: { tenant_id: tenantId, cliente_telefone: clienteTelefone } },
    update: {},
    create: { tenant_id: tenantId, cliente_telefone: clienteTelefone },
  });
}

export async function atualizarSessao(
  tenantId: string,
  clienteTelefone: string,
  etapa: Etapa,
  dados: DadosColetados
) {
  return prisma.sessaoBot.update({
    where: { tenant_id_cliente_telefone: { tenant_id: tenantId, cliente_telefone: clienteTelefone } },
    data: { etapa_atual: etapa, dados_coletados: dados as object },
  });
}

export async function resetarSessao(tenantId: string, clienteTelefone: string) {
  return prisma.sessaoBot.update({
    where: { tenant_id_cliente_telefone: { tenant_id: tenantId, cliente_telefone: clienteTelefone } },
    data: { etapa_atual: "INICIO", dados_coletados: {} },
  });
}
