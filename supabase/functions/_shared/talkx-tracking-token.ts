/**
 * Talk X — token opaco de rastreamento (?r=<token>), compartilhado entre
 * talkx-send (gera) e talkx-link (resolve). Isolates separados importam
 * daqui — o contrato entre eles é único, não duplicado.
 *
 * Formato: base64url( cipher[16] || tag[8] ) = 32 chars.
 * - cipher = uuid_bytes XOR SHA-256(secret + "|talkx-track-enc-v1")[0:16]
 *   (ofusca o UUID; determinístico, reversível, sem estado no banco)
 * - tag = HMAC-SHA256(secret, "talkx-track-v1" || cipher)[0:8]
 *   (autenticidade, conferida em tempo constante antes de qualquer SELECT)
 *
 * Resolução O(1): decodifica local (sem banco), depois 2 point lookups
 * indexados (link por slug, recipient por id + checagem de campanha).
 * Nenhuma varredura, nenhuma paginação, nenhum custo O(N) por clique.
 * `r=` aleatório falha no decode/MAC sem tocar o banco.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENC_DOMAIN = "|talkx-track-enc-v1";
const MAC_DOMAIN = "talkx-track-v1";

export function isTalkxRecipientUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function base64UrlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) return null;
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (input.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function uuidToBytes(uuid: string): Uint8Array | null {
  if (!UUID_RE.test(uuid)) return null;
  const hex = uuid.replace(/-/g, "");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

function constTimeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function encMask(secret: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret + ENC_DOMAIN),
  );
  return new Uint8Array(digest).slice(0, 16);
}

async function computeTag(cipher: Uint8Array, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const domain = new TextEncoder().encode(MAC_DOMAIN);
  const data = new Uint8Array(domain.length + cipher.length);
  data.set(domain, 0);
  data.set(cipher, domain.length);
  const mac = await crypto.subtle.sign("HMAC", key, data);
  return new Uint8Array(mac).slice(0, 8);
}

/**
 * Gera o token opaco do recipient_id. Sem segredo devolve undefined:
 * o chamador NÃO pode cair no id cru.
 */
export async function encodeTalkxRecipientToken(
  recipientId: string,
  secret: string | undefined,
): Promise<string | undefined> {
  if (!secret) return undefined;
  const uuidBytes = uuidToBytes(recipientId);
  if (!uuidBytes) return undefined;
  const mask = await encMask(secret);
  const cipher = new Uint8Array(16);
  for (let i = 0; i < 16; i++) cipher[i] = uuidBytes[i] ^ mask[i];
  const tag = await computeTag(cipher, secret);
  const tokenBytes = new Uint8Array(24);
  tokenBytes.set(cipher, 0);
  tokenBytes.set(tag, 16);
  return base64UrlEncode(tokenBytes);
}

/**
 * Decodifica o token para o recipient_id SEM banco. Retorna null quando
 * o token é forjado, vem de outro segredo ou está malformado — antes de
 * qualquer SELECT (clique com `r=` aleatório não amplifica custo).
 */
export async function decodeTalkxRecipientToken(
  token: string,
  secret: string | undefined,
): Promise<string | null> {
  if (!secret) return null;
  const bytes = base64UrlDecode(token);
  if (!bytes || bytes.length !== 24) return null;
  const cipher = bytes.slice(0, 16);
  const tag = bytes.slice(16, 24);
  const expected = await computeTag(cipher, secret);
  if (!constTimeBytesEqual(expected, tag)) return null;
  const mask = await encMask(secret);
  const uuidBytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) uuidBytes[i] = cipher[i] ^ mask[i];
  const uuid = bytesToUuid(uuidBytes);
  return UUID_RE.test(uuid) ? uuid : null;
}
