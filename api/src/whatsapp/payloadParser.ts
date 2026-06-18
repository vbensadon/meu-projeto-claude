export type PayloadParsed = {
  type: string;
  value: string;
};

/**
 * Decodifica um payload estruturado no formato "tipo:valor".
 * Ex: "barber:abc123"  → { type: "barber",  value: "abc123" }
 *     "slot:2026-06-18T14:00" → { type: "slot",   value: "2026-06-18T14:00" }
 *     "waitlist:yes"   → { type: "waitlist", value: "yes" }
 *     "confirm:no"     → { type: "confirm",  value: "no" }
 *
 * Se o payload não seguir o formato "tipo:valor", retorna type="raw" e value=o payload inteiro,
 * permitindo que o handler o trate como texto livre.
 */
export function parsePayload(payload: string): PayloadParsed {
  const idx = payload.indexOf(":");
  if (idx === -1) return { type: "raw", value: payload };
  return {
    type: payload.slice(0, idx),
    value: payload.slice(idx + 1),
  };
}

/**
 * Retorna true se a string é um payload estruturado (contém ":").
 */
export function isStructuredPayload(input: string): boolean {
  return input.includes(":");
}
