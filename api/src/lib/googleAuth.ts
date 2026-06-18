import { google } from "googleapis";
import { prisma } from "./prisma";

// Campos de credenciais OAuth2 por tenant (armazenados no banco)
// google_access_token, google_refresh_token, google_token_expiry são adicionados na migration

export function criarOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function gerarUrlAutorizacao(tenantId: string): string {
  const oauth2 = criarOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
    state: tenantId,
  });
}

export async function trocarCodigoPorTokens(
  tenantId: string,
  code: string
): Promise<void> {
  const oauth2 = criarOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      google_access_token: tokens.access_token,
      google_refresh_token: tokens.refresh_token ?? undefined,
      google_token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : undefined,
    },
  });
}

export async function obterClienteAutenticado(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  if (!tenant.google_refresh_token) {
    throw new Error(`Tenant ${tenantId} não autorizou o Google Calendar.`);
  }

  const oauth2 = criarOAuth2Client();
  oauth2.setCredentials({
    access_token: tenant.google_access_token ?? undefined,
    refresh_token: tenant.google_refresh_token,
    expiry_date: tenant.google_token_expiry?.getTime(),
  });

  // Renovação automática de token
  oauth2.on("tokens", async (tokens) => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        google_access_token: tokens.access_token ?? undefined,
        google_token_expiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
      },
    });
  });

  return oauth2;
}
