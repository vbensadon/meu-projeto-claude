-- AlterTable
ALTER TABLE "servicos" ADD COLUMN     "ordem" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "config_bot" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "msg_boas_vindas" TEXT NOT NULL DEFAULT 'Olá! Bem-vindo à nossa barbearia 💈 Como posso ajudar você?

1️⃣ Agendar
2️⃣ Ver meu agendamento
3️⃣ Cancelar agendamento',
    "msg_confirmacao" TEXT NOT NULL DEFAULT '✅ Agendamento confirmado!

Olá, {clientName}!
Seu horário está marcado:
📅 {date} às {time}
✂️ {serviceName} com {barberName}

Te esperamos!',
    "msg_cancelamento" TEXT NOT NULL DEFAULT '❌ Agendamento cancelado.

Olá, {clientName}! Seu agendamento de {serviceName} no dia {date} às {time} foi cancelado.

Fique à vontade para reagendar quando quiser!',
    "msg_fora_horario" TEXT NOT NULL DEFAULT 'Olá! 😊 Nosso atendimento é de segunda a sábado, das 8h às 18h.

Deixe sua mensagem e retornaremos em breve!',
    "msg_reagendamento" TEXT NOT NULL DEFAULT 'Gostaria de reagendar? Basta me dizer o novo horário de sua preferência! 😊',
    "msg_lista_espera" TEXT NOT NULL DEFAULT 'Não há horários disponíveis para o período solicitado. Deseja entrar na lista de espera? Vou te avisar quando surgir uma vaga! ✉️',

    CONSTRAINT "config_bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horarios_bot" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "hora_inicio" TEXT NOT NULL DEFAULT '08:00',
    "hora_fim" TEXT NOT NULL DEFAULT '18:00',

    CONSTRAINT "horarios_bot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "config_bot_tenant_id_key" ON "config_bot"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "horarios_bot_tenant_id_dia_semana_key" ON "horarios_bot"("tenant_id", "dia_semana");

-- AddForeignKey
ALTER TABLE "config_bot" ADD CONSTRAINT "config_bot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_bot" ADD CONSTRAINT "horarios_bot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
