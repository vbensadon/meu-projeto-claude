import { prisma } from "../../lib/prisma";

export async function logAudit(
  platformUserId: string,
  action: string,
  options?: {
    targetTenantId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }
) {
  await prisma.auditLog.create({
    data: {
      platformUserId,
      action,
      targetTenantId: options?.targetTenantId,
      metadata: options?.metadata as any,
      ipAddress: options?.ipAddress,
    },
  });
}
