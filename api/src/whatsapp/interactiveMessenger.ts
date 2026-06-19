import twilio from "twilio";
import { prisma } from "../lib/prisma";

export type InteractiveOption = {
  label: string;
  payload: string;
  description?: string;
};

export type SendInteractiveParams = {
  tenantId: string;
  to: string;
  bodyText: string;
  options: InteractiveOption[];
  inSession: boolean;
  contentSid?: string;
  contentVariables?: Record<string, string>;
};

// Cache em memória: hash das opções → contentSid já criado nessa instância do servidor
const templateCache = new Map<string, string>();

function hashOptions(bodyText: string, options: InteractiveOption[]): string {
  return JSON.stringify({ bodyText, options });
}

async function criarQuickReply(
  client: ReturnType<typeof twilio>,
  bodyText: string,
  options: InteractiveOption[]
): Promise<string> {
  const key = hashOptions(bodyText, options);
  if (templateCache.has(key)) return templateCache.get(key)!;

  const content = await (client as any).content.v1.contents.create({
    types: {
      "twilio/quick-reply": {
        body: bodyText,
        actions: options.map((o) => ({ title: o.label, id: o.payload })),
      },
    },
    friendlyName: `qr_${Date.now()}`,
    language: "pt-BR",
  });

  templateCache.set(key, content.sid);
  return content.sid as string;
}

async function criarListPicker(
  client: ReturnType<typeof twilio>,
  bodyText: string,
  options: InteractiveOption[]
): Promise<string> {
  const key = hashOptions(bodyText, options);
  if (templateCache.has(key)) return templateCache.get(key)!;

  const content = await (client as any).content.v1.contents.create({
    types: {
      "twilio/list-picker": {
        body: bodyText,
        button: "Escolher",
        items: options.map((o) => ({
          item: o.label,
          id: o.payload,
          ...(o.description ? { description: o.description } : {}),
        })),
      },
    },
    friendlyName: `lp_${Date.now()}`,
    language: "pt-BR",
  });

  templateCache.set(key, content.sid);
  return content.sid as string;
}

function buildFallbackText(bodyText: string, options: InteractiveOption[]): string {
  const lista = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  return `${bodyText}\n\n${lista}\n\nDigite o número da opção.`;
}

const MOCK = process.env.TWILIO_MOCK === "true";

export async function sendInteractiveMessage(params: SendInteractiveParams): Promise<void> {
  const { tenantId, to, bodyText, options, inSession } = params;

  if (MOCK) {
    const linha = "─".repeat(40);
    const botoes = options.map((o, i) => `  ${i + 1}. ${o.label}${o.description ? ` — ${o.description}` : ""}`).join("\n");
    console.log(`\n[MOCK] ➜ ${to}\n${bodyText}\n${botoes}\n${linha}`);
    return;
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const client = twilio(tenant.twilio_account_sid, tenant.twilio_auth_token);

  // Fora da janela de sessão: obrigatoriamente usa template aprovado pela Meta
  if (!inSession) {
    if (!params.contentSid) {
      throw new Error(
        `[InteractiveMessenger] Fora da sessão de 24h e sem contentSid para tenant ${tenantId}. Configure um template aprovado.`
      );
    }
    await client.messages.create({
      from: tenant.telefone_whatsapp,
      to,
      contentSid: params.contentSid,
      contentVariables: JSON.stringify(params.contentVariables ?? {}),
    });
    console.log(`[Interactive] template aprovado enviado para ${to}`);
    return;
  }

  // Dentro da sessão: tenta interativo, fallback para texto numerado
  try {
    let contentSid: string;

    if (options.length <= 3) {
      contentSid = await criarQuickReply(client, bodyText, options);
      console.log(`[Interactive] quick-reply (${options.length} botões) → ${to}`);
    } else {
      contentSid = await criarListPicker(client, bodyText, options);
      console.log(`[Interactive] list-picker (${options.length} itens) → ${to}`);
    }

    await client.messages.create({
      from: tenant.telefone_whatsapp,
      to,
      contentSid,
    });
  } catch (err: any) {
    // Fallback: mensagem de texto numerada — nunca deixa o cliente sem resposta
    console.warn(`[Interactive] fallback para texto (erro: ${err?.message ?? err})`);
    await client.messages.create({
      from: tenant.telefone_whatsapp,
      to,
      body: buildFallbackText(bodyText, options),
    });
  }
}

// Envia mensagem de texto simples (sem opções interativas)
export async function sendTextMessage(
  tenantId: string,
  to: string,
  body: string
): Promise<void> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const client = twilio(tenant.twilio_account_sid, tenant.twilio_auth_token);
  await client.messages.create({ from: tenant.telefone_whatsapp, to, body });
}
