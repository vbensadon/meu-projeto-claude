import { PrismaClient, PlatformRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // ── Tenant de demonstração ────────────────────────────────────────────────
  const senhaHash = await bcrypt.hash("senha123", 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "barbearia-demo" },
    update: {},
    create: {
      nome: "Barbearia Demo",
      slug: "barbearia-demo",
      telefone_whatsapp: "whatsapp:+5511999999999",
      twilio_account_sid: "ACtest",
      twilio_auth_token: "tokentest",
      senha_hash: senhaHash,
      profissionais: {
        create: [
          { nome: "Carlos Silva", ativo: true },
          { nome: "João Souza", ativo: true },
        ],
      },
      servicos: {
        create: [
          { nome: "Corte de Cabelo", duracao_minutos: 30, preco: 35 },
          { nome: "Barba", duracao_minutos: 20, preco: 25 },
          { nome: "Corte + Barba", duracao_minutos: 50, preco: 55 },
        ],
      },
    },
  });
  console.log("Tenant demo:", tenant.slug);

  // ── Plataforma: Planos ────────────────────────────────────────────────────
  const planos = [
    {
      name: "Starter",
      priceMonthly: 99,
      maxBarbers: 2,
      maxMessages: 500,
      features: {
        commissions: false,
        campaigns: false,
        interactive_messages: true,
        waitlist: true,
      },
    },
    {
      name: "Pro",
      priceMonthly: 199,
      maxBarbers: 5,
      maxMessages: 2000,
      features: {
        commissions: true,
        campaigns: true,
        interactive_messages: true,
        waitlist: true,
      },
    },
    {
      name: "Premium",
      priceMonthly: 349,
      maxBarbers: 15,
      maxMessages: 10000,
      features: {
        commissions: true,
        campaigns: true,
        interactive_messages: true,
        waitlist: true,
        priority_support: true,
      },
    },
  ];

  for (const plano of planos) {
    const existing = await prisma.plan.findFirst({ where: { name: plano.name } });
    if (!existing) {
      const created = await prisma.plan.create({ data: plano });
      console.log(`Plano criado: ${created.name} (R$${created.priceMonthly}/mês)`);
    } else {
      console.log(`Plano já existe: ${existing.name}`);
    }
  }

  // ── Plataforma: SUPERADMIN ────────────────────────────────────────────────
  const adminHash = await bcrypt.hash("Admin@2025!", 10);
  const superadmin = await prisma.platformUser.upsert({
    where: { email: "admin@agendabot.com.br" },
    update: {},
    create: {
      name: "Superadmin",
      email: "admin@agendabot.com.br",
      password: adminHash,
      role: PlatformRole.SUPERADMIN,
    },
  });
  console.log(`PlatformUser SUPERADMIN: ${superadmin.email}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
