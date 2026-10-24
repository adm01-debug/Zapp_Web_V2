/**
 * Verificação BLOQUEANTE de assinatura de webhook (IA-013).
 *
 * Por que existe, separado de `hmac-validation.ts`: os helpers de lá são de
 * **modo sombra** — por contrato nunca lançam e o retorno NUNCA pode gatear a
 * resposta (ver `hmac-validation.ts`, bloco "SHADOW MODE helpers"). Eles seguem
 * valendo para os webhooks que ainda observam assinatura (Evolution, Gmail).
 *
 * Aqui é o oposto: o veredito DECIDE a resposta. Sem secret configurado, a
 * requisição é recusada (falha fechada) — não existe caminho em que a ausência
 * de configuração libere o processamento.
 */

import { verifyHmacSignature } from './hmac-validation.ts';

export type SignatureFailureReason =
  | 'missing_secret'
  | 'missing_signature'
  | 'malformed_signature'
  | 'stale_timestamp'
  | 'invalid_signature';

export type SignatureVerdict =
  | { ok: true; reason: 'valid' }
  | { ok: false; reason: SignatureFailureReason };

export interface VerifySignatureOptions {
  /** Tolerância de relógio, em segundos, para o timestamp do provedor. Padrão: 300 (5 min). */
  toleranceSeconds?: number;
  /** Injeção de relógio para teste. */
  nowMs?: number;
}

const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Lê o header `ElevenLabs-Signature` (`t=<unix_seconds>,v0=<hmac_sha256_hex>`).
 * Devolve `null` quando o formato não é o esperado.
 */
export function parseElevenLabsSignature(
  header: string | null,
): { timestamp: string; signature: string } | null {
  if (!header) return null;

  const parts: Record<string, string> = {};
  for (const part of header.split(',')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    // Chave repetida torna o header ambíguo ("último vence" seria uma escolha
    // arbitrária do parser): recusa em vez de adivinhar.
    if (Object.prototype.hasOwnProperty.call(parts, key)) return null;
    parts[key] = part.slice(eqIndex + 1).trim();
  }

  const timestamp = parts['t'];
  const signature = parts['v0'];
  if (!timestamp || !signature) return null;
  if (!/^\d+$/.test(timestamp)) return null;
  if (!/^[0-9a-f]{32,}$/i.test(signature)) return null;

  return { timestamp, signature };
}

/**
 * Valida a assinatura do webhook da ElevenLabs de forma bloqueante:
 * secret obrigatório, header presente e bem formado, timestamp dentro da
 * tolerância (defesa contra replay) e HMAC-SHA256 sobre `${t}.${payload}`.
 */
export async function verifyElevenLabsSignature(
  headers: Headers,
  payload: string,
  secret: string | undefined | null,
  options: VerifySignatureOptions = {},
): Promise<SignatureVerdict> {
  if (!secret) return { ok: false, reason: 'missing_secret' };

  const header = headers.get('elevenlabs-signature') ?? headers.get('xi-signature');
  if (!header) return { ok: false, reason: 'missing_signature' };

  const parsed = parseElevenLabsSignature(header);
  if (!parsed) return { ok: false, reason: 'malformed_signature' };

  const nowSeconds = (options.nowMs ?? Date.now()) / 1000;
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - Number(parsed.timestamp)) > tolerance) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const valid = await verifyHmacSignature(`${parsed.timestamp}.${payload}`, parsed.signature, secret);
  return valid ? { ok: true, reason: 'valid' } : { ok: false, reason: 'invalid_signature' };
}
