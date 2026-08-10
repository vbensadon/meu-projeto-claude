import { prisma } from "../../lib/prisma";

export async function isFeatureEnabled(tenantId: string, key: string): Promise<boolean> {
  const flag = await prisma.featureFlag.findUnique({
    where: { tenantId_key: { tenantId, key } },
  });
  return flag?.enabled ?? false;
}

export async function getTenantFeatures(tenantId: string): Promise<Record<string, boolean>> {
  const flags = await prisma.featureFlag.findMany({ where: { tenantId } });
  return Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
}

export async function setFeatureFlag(tenantId: string, key: string, enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { enabled },
    create: { tenantId, key, enabled },
  });
}

export async function syncFlagsFromPlan(tenantId: string, planFeatures: Record<string, boolean>) {
  for (const [key, enabled] of Object.entries(planFeatures)) {
    await prisma.featureFlag.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: {},
      create: { tenantId, key, enabled },
    });
  }
}
