import { prisma } from "../../lib/prisma";

export async function getOrCreateConversation(
  tenantId: string,
  clientPhone: string,
  clientName?: string
) {
  const existing = await prisma.botConversation.findFirst({
    where: { tenantId, clientPhone, status: "ACTIVE" },
  });
  if (existing) {
    await prisma.botConversation.update({
      where: { id: existing.id },
      data: {
        lastMessageAt: new Date(),
        ...(clientName && !existing.clientName ? { clientName } : {}),
      },
    });
    return existing;
  }
  return prisma.botConversation.create({
    data: { tenantId, clientPhone, clientName: clientName ?? null, status: "ACTIVE" },
  });
}

export async function addMessage(
  conversationId: string,
  direction: "inbound" | "outbound",
  body: string,
  payload?: string,
  stepAtTime?: string
) {
  return prisma.botMessage.create({
    data: { conversationId, direction, body, payload: payload ?? null, stepAtTime: stepAtTime ?? null },
  });
}

export async function updateConversationStep(
  tenantId: string,
  clientPhone: string,
  step: string
) {
  await prisma.botConversation.updateMany({
    where: { tenantId, clientPhone, status: "ACTIVE" },
    data: { currentStep: step, lastMessageAt: new Date() },
  });
}

export async function completeConversation(tenantId: string, clientPhone: string) {
  await prisma.botConversation.updateMany({
    where: { tenantId, clientPhone, status: "ACTIVE" },
    data: { status: "COMPLETED" },
  });
}

export async function markAbandonedConversations(inactiveHours = 4) {
  const cutoff = new Date(Date.now() - inactiveHours * 60 * 60 * 1000);
  const result = await prisma.botConversation.updateMany({
    where: { status: "ACTIVE", lastMessageAt: { lt: cutoff } },
    data: { status: "ABANDONED" },
  });
  if (result.count > 0) {
    console.log(`[Jobs] ${result.count} conversas marcadas como ABANDONED`);
  }
}
