import twilio from "twilio";

interface CredenciaisTwilio {
  accountSid: string;
  authToken: string;
  numeroOrigem: string;
}

export async function enviarMensagem(
  creds: CredenciaisTwilio,
  destinatario: string,
  mensagem: string
): Promise<void> {
  try {
    const client = twilio(creds.accountSid, creds.authToken);
    await client.messages.create({
      from: creds.numeroOrigem,
      to: destinatario,
      body: mensagem,
    });
  } catch (err) {
    console.error("[Twilio] Erro ao enviar mensagem:", err);
    throw err;
  }
}

export function extrairNumero(raw: string): string {
  // Twilio envia "whatsapp:+5511999999999" — normaliza para "+5511999999999"
  return raw.replace(/^whatsapp:/, "");
}
