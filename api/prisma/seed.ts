import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
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

  console.log("Seed concluído:", tenant.slug);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
