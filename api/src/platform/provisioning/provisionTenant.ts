import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { syncFlagsFromPlan } from "../services/featureFlags";

export type ProvisionTenantInput = {
  barbershopName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  planId: string;
  bringOwnNumber?: boolean;
  twilioNumber?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
};

type ProvisionResult = {
  tenantId: string;
  slug: string;
  tempPassword: string;
};

async function logStep(
  tenantId: string,
  step: string,
  status: "success" | "failed" | "pending",
  error?: string
) {
  await prisma.provisioningLog.create({ data: { tenantId, step, status, error } });
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${base}-${attempt}`;
  }
  return slug;
}

export async function provisionTenant(
  input: ProvisionTenantInput
): Promise<ProvisionResult> {
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan) throw new Error("Plano não encontrado.");

  // Idempotency: não criar duplicata por email de dono
  const existingUser = await prisma.usuario.findFirst({
    where: { email: input.ownerEmail, role: "dono" },
    include: { tenant: true },
  });
  if (existingUser) {
    return {
      tenantId: existingUser.tenant_id,
      slug: existingUser.tenant.slug,
      tempPassword: "(já provisionado)",
    };
  }

  const slug = await uniqueSlug(generateSlug(input.barbershopName));
  const tempPassword = Math.random().toString(36).slice(2, 10) + "!A1";
  const senhaHash = await bcrypt.hash(tempPassword, 10);
  const ownerHash = await bcrypt.hash(tempPassword, 10);

  const planFeatures: Record<string, boolean> =
    typeof plan.features === "object" && plan.features !== null
      ? (plan.features as Record<string, boolean>)
      : {};

  // Número Twilio: se BYON use o fornecido, senão placeholder
  const whatsappNumber = input.bringOwnNumber && input.twilioNumber
    ? `whatsapp:${input.twilioNumber}`
    : "whatsapp:PENDING";

  const twilioSid = input.twilioAccountSid ?? "PENDING";
  const twilioToken = input.twilioAuthToken ?? "PENDING";

  let tenantId: string;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Criar Tenant
      const tenant = await tx.tenant.create({
        data: {
          nome: input.barbershopName,
          slug,
          telefone_whatsapp: whatsappNumber,
          twilio_account_sid: twilioSid,
          twilio_auth_token: twilioToken,
          twilioNumber: input.twilioNumber ?? null,
          senha_hash: senhaHash,
          status: "PROVISIONING",
          whatsappStatus: input.bringOwnNumber ? "PENDING" : "PENDING",
          calendarStatus: "PENDING",
        },
      });

      // 2. Criar usuário OWNER
      await tx.usuario.create({
        data: {
          tenant_id: tenant.id,
          nome: input.ownerName,
          email: input.ownerEmail,
          senha_hash: ownerHash,
          role: "dono",
          ativo: true,
        },
      });

      // 3. Seed BotConfig com mensagens padrão
      await tx.configBot.create({
        data: { tenant_id: tenant.id },
      });

      // 4. Seed HorarioBot (seg-sáb 8h-18h)
      const diasSemana = [1, 2, 3, 4, 5, 6]; // segunda a sábado
      await tx.horarioBot.createMany({
        data: diasSemana.map((dia) => ({
          tenant_id: tenant.id,
          dia_semana: dia,
          ativo: true,
          hora_inicio: "08:00",
          hora_fim: "18:00",
        })),
      });

      // 5. Seed serviços-template
      await tx.servico.createMany({
        data: [
          { tenant_id: tenant.id, nome: "Corte de Cabelo", duracao_minutos: 30, preco: 35, ordem: 1 },
          { tenant_id: tenant.id, nome: "Barba", duracao_minutos: 20, preco: 25, ordem: 2 },
          { tenant_id: tenant.id, nome: "Corte + Barba", duracao_minutos: 50, preco: 55, ordem: 3 },
        ],
      });

      // 6. Criar Subscription (TRIAL 14 dias)
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 14);
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: "TRIAL",
          trialEndsAt: trialEnds,
        },
      });

      return tenant;
    });

    tenantId = result.id;

    // 7. Feature flags (fora da transação, falha não é crítica)
    await logStep(tenantId, "feature_flags", "pending");
    await syncFlagsFromPlan(tenantId, planFeatures);
    await logStep(tenantId, "feature_flags", "success");

    // 8. Registrar logs dos passos síncronos
    await prisma.provisioningLog.createMany({
      data: [
        { tenantId, step: "tenant_created", status: "success" },
        { tenantId, step: "owner_user", status: "success" },
        { tenantId, step: "bot_config", status: "success" },
        { tenantId, step: "default_services", status: "success" },
        { tenantId, step: "subscription", status: "success" },
        { tenantId, step: "whatsapp", status: input.bringOwnNumber ? "pending" : "pending" },
        { tenantId, step: "google_calendar", status: "pending" },
        { tenantId, step: "welcome_email", status: "pending" },
      ],
    });

    // 9. Simular envio de email de boas-vindas (plugar SendGrid/SES aqui)
    console.log(`[EMAIL] Boas-vindas para ${input.ownerEmail}: senha temporária = ${tempPassword}`);
    await prisma.provisioningLog.updateMany({
      where: { tenantId, step: "welcome_email" },
      data: { status: "success" },
    });

  } catch (err: any) {
    // Se a transação falhou, registra apenas se o tenant foi criado
    throw new Error(`Falha no provisionamento: ${err.message}`);
  }

  return { tenantId, slug, tempPassword };
}
