/**
 * Parser central das respostas da Edge Function de varredura (paridade V3 → V2,
 * HZ1-02: o arquivo que o agente manda ao cliente passa pelo `file-security-scanner`).
 *
 * Contrato do backend (`file-security-scanner`):
 *   Varreu e passou:  { success: true, scanned: true, verdict: "clean", scanId, message }
 *   Varreu e barrou:  { error: true, code, message, verdict, scanId?, contract?, details? }
 *   NÃO varreu:       { success: true, scanned: false, verdict: "unknown", reason,
 *                       message, scanId: null }  ← falha-aberto do servidor
 *
 * Este módulo normaliza:
 *   1. Invocações bem-sucedidas (`data.success === true`).
 *   2. Invocações com erro do Supabase (`FunctionsHttpError`), cujo corpo com `code`
 *      vem enterrado em `error.context.response`.
 *   3. Falhas de rede/parse (sem corpo nenhum).
 *   4. O envelope de "não varreu" (`scanned: false`) como resultado próprio (`skipped`),
 *      para o front seguir com aviso discreto em vez de afirmar que está limpo.
 *
 * A tela consome SÓ o `ScanResult` normalizado.
 */

/** Códigos que o backend pode devolver. */
export type ScanCode =
  | 'MALWARE_DETECTED'
  | 'SUSPICIOUS_FILE'
  | 'SCAN_TIMEOUT'
  | 'SCAN_UNAVAILABLE'
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'METHOD_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'STORAGE_ERROR'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export type ScanVerdict = 'clean' | 'malicious' | 'suspicious' | 'unknown';

/** O arquivo foi varrido e passou. */
export interface ScanSuccess {
  status: 'success';
  verdict: 'clean';
  scanId: string | null;
  message: string;
  payload: Record<string, unknown>;
}

/**
 * O arquivo NÃO foi varrido (servidor em falha-aberto: sem chave, arquivo grande ou
 * scanner fora). Não é erro e não é "limpo": o front segue, avisando em voz baixa.
 */
export interface ScanSkipped {
  status: 'skipped';
  reason: string;
  message: string;
  scanId: null;
  payload: Record<string, unknown>;
}

/** O arquivo foi barrado, a varredura falhou ou não houve como decidir. */
export interface ScanError {
  status: 'error';
  code: ScanCode;
  message: string;
  verdict: ScanVerdict;
  scanId: string | null;
  /** Nome do contrato da Edge Function que produziu o erro. Opcional (envelopes antigos omitem). */
  contract?: string;
  details?: Record<string, unknown>;
}

export type ScanResult = ScanSuccess | ScanSkipped | ScanError;

/** Segura o envio por completo — o arquivo não pode ser reenviado como está. */
export type BlockingScanError = ScanError & { code: 'MALWARE_DETECTED' | 'SUSPICIOUS_FILE' };
/** Verdadeiro quando o resultado é um bloqueio definitivo (malware ou suspeito). */
export function isBlocking(r: ScanResult): r is BlockingScanError {
  return r.status === 'error' && (r.code === 'MALWARE_DETECTED' || r.code === 'SUSPICIOUS_FILE');
}

/** O chamador pode tentar de novo a mesma operação. */
export type RetryableScanError = ScanError & {
  code: 'SCAN_TIMEOUT' | 'SCAN_UNAVAILABLE' | 'NETWORK_ERROR' | 'RATE_LIMITED';
};
/** Verdadeiro quando a falha é passageira e o mesmo pedido pode ser repetido. */
export function isRetryable(r: ScanResult): r is RetryableScanError {
  return (
    r.status === 'error' &&
    (r.code === 'SCAN_TIMEOUT' ||
      r.code === 'SCAN_UNAVAILABLE' ||
      r.code === 'NETWORK_ERROR' ||
      r.code === 'RATE_LIMITED')
  );
}

/** Entrada ruim — o chamador precisa corrigir o pedido, não repetir como está. */
export type InputScanError = ScanError & { code: 'INVALID_INPUT' | 'METHOD_NOT_ALLOWED' };
/** Verdadeiro quando o erro de varredura veio de entrada ruim. */
export function isInputError(r: ScanResult): r is InputScanError {
  return r.status === 'error' && (r.code === 'INVALID_INPUT' || r.code === 'METHOD_NOT_ALLOWED');
}

/**
 * Erro próprio para levar um `ScanResult` estruturado para cima, via rejeição de
 * Promise, sem perder a informação.
 */
export class ScanBlockedError extends Error {
  readonly result: ScanResult;
  constructor(result: ScanResult) {
    super(result.status === 'error' ? result.message : 'Falha na verificação do arquivo');
    this.name = 'ScanBlockedError';
    this.result = result;
  }
}

const BACKEND_CODES = new Set<ScanCode>([
  'MALWARE_DETECTED',
  'SUSPICIOUS_FILE',
  'SCAN_TIMEOUT',
  'SCAN_UNAVAILABLE',
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'METHOD_NOT_ALLOWED',
  'RATE_LIMITED',
  'STORAGE_ERROR',
  'INTERNAL_ERROR',
]);

function asScanCode(v: unknown): ScanCode {
  if (typeof v === 'string' && BACKEND_CODES.has(v as ScanCode)) return v as ScanCode;
  return 'UNKNOWN';
}

function asVerdict(v: unknown): ScanVerdict {
  return v === 'clean' || v === 'malicious' || v === 'suspicious' || v === 'unknown'
    ? v
    : 'unknown';
}

function asScanId(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Texto de um campo do envelope; `null` quando não é string não-vazia. */
function asMessage(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function fromBody(body: Record<string, unknown> | null | undefined): ScanResult | null {
  if (!body || typeof body !== 'object') return null;

  if (body.success === true) {
    // `scanned: false` é o envelope de NÃO varreu (fail-open do servidor): seguir sim,
    // mas como `skipped` — dizer "clean" aqui seria afirmar o que não foi checado.
    if (body.scanned === false) {
      return {
        status: 'skipped',
        reason: asMessage(body.reason) ?? 'unknown',
        message:
          asMessage(body.message) ??
          'O arquivo não pôde ser verificado agora e será enviado mesmo assim.',
        scanId: null,
        payload: body,
      };
    }
    return {
      status: 'success',
      verdict: 'clean',
      scanId: asScanId(body.scanId),
      message: asMessage(body.message) ?? 'Arquivo verificado.',
      payload: body,
    };
  }

  if (body.error === true || typeof body.code === 'string') {
    return {
      status: 'error',
      code: asScanCode(body.code),
      message: asMessage(body.message) ?? 'Não foi possível verificar o arquivo.',
      verdict: asVerdict(body.verdict),
      scanId: asScanId(body.scanId),
      contract: typeof body.contract === 'string' ? body.contract : undefined,
      details:
        typeof body.details === 'object' && body.details !== null
          ? (body.details as Record<string, unknown>)
          : undefined,
    };
  }

  return null;
}

/**
 * O corpo de um `FunctionsHttpError` vive em `error.context` (um `Response`).
 * Lê direto do corpo, sem `clone()`: o erro é nosso e ninguém mais consome o
 * original — e o `clone()` quebrava no jsdom/undici, virando ramo morto.
 */
async function readBodyFromInvokeError(error: unknown): Promise<Record<string, unknown> | null> {
  if (!error || typeof error !== 'object') return null;
  const ctx = (error as { context?: unknown }).context;
  if (!ctx) return null;

  if (typeof (ctx as { text?: unknown }).text === 'function') {
    try {
      const text = await (ctx as Response).text();
      if (!text) return null;
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (typeof ctx === 'object') return ctx as Record<string, unknown>;
  return null;
}

/**
 * Normaliza o retorno de `supabase.functions.invoke` em um `ScanResult`.
 * Sempre resolve — nunca lança — para o chamador usar um único `switch`.
 */
export async function parseScanInvocation(args: {
  data: Record<string, unknown> | null | undefined;
  error: unknown;
}): Promise<ScanResult> {
  const { data, error } = args;

  // 1. Corpo direto — a maioria dos caminhos de sucesso cai aqui.
  const fromData = fromBody(data ?? null);
  if (fromData) return fromData;

  // 2. Corpo enterrado dentro do FunctionsHttpError.
  if (error) {
    const body = await readBodyFromInvokeError(error);
    const fromErrBody = fromBody(body);
    if (fromErrBody) return fromErrBody;

    // 3. Falha de transporte — sem corpo parseável.
    const message =
      (error as { message?: string }).message ?? 'Falha de comunicação com o servidor.';
    return {
      status: 'error',
      code: 'NETWORK_ERROR',
      message,
      verdict: 'unknown',
      scanId: null,
    };
  }

  // 4. Sem data e sem error — caso degenerado.
  return {
    status: 'error',
    code: 'UNKNOWN',
    message: 'Resposta inválida do servidor.',
    verdict: 'unknown',
    scanId: null,
  };
}
