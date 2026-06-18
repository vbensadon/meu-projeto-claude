import { prisma } from "../lib/prisma";

const JANELA_SESSAO_MS = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Retorna true se o cliente enviou alguma mensagem nas últimas 24h.
 * Dentro dessa janela, o WhatsApp permite mensagens interativas livres (sem template aprovado).
 */
export async function isWithinSession(tenantId: string, clienteTelefone: string): Promise<boolean> {
  const sessao = await prisma.sessaoBot.findUnique({
    where: { tenant_id_cliente_telefone: { tenant_id: tenantId, cliente_telefone: clienteTelefone } },
    select: { ultima_mensagem_em: true },
  });

  if (!sessao?.ultima_mensagem_em) return false;

  const agora = Date.now();
  const ultima = sessao.ultima_mensagem_em.getTime();
  return agora - ultima < JANELA_SESSAO_MS;
}

/**
 * Registra o timestamp da última mensagem recebida do cliente.
 * Deve ser chamado no webhook sempre que chegar uma mensagem.
 */
export async function marcarMensagemRecebida(
  tenantId: string,
  clienteTelefone: string
): Promise<void> {
  await prisma.sessaoBot.upsert({
    where: { tenant_id_cliente_telefone: { tenant_id: tenantId, cliente_telefone: clienteTelefone } },
    update: { ultima_mensagem_em: new Date() },
    create: {
      tenant_id: tenantId,
      cliente_telefone: clienteTelefone,
      ultima_mensagem_em: new Date(),
    },
  });
}
