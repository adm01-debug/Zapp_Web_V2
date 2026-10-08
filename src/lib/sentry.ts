/**
 * Sentry no front — itens 031-032 do plano de paridade (cartão SL-056).
 *
 * Por que existe: o inventário de 07/10/2026 mede "Sem Sentry.init no front/edges".
 * O V2 não aceita dependência nova (`@sentry/react` está fora), então o protocolo
 * de envelope do Sentry (cabeçalho + item + evento, um POST por evento) é falado
 * aqui mesmo, com `fetch`, no DSN que já está documentado em `.env.example`
 * (`VITE_SENTRY_DSN`, "DSN público por design" — `docs/security/secret-surface-inventory.md`).
 *
 * DESLIGADO POR PADRÃO — e é essa a garantia que importa: sem `VITE_SENTRY_DSN`
 * (ou com DSN inválido) `initSentry()` devolve `false` e nenhum `fetch` acontece;
 * ligar o rastreio é decisão do dono (qual Sentry: SaaS ou GlitchTip self-hosted),
 * e é ele quem publica o DSN no ambiente da Vercel.
 *
 * O que o evento leva: tipo, mensagem e stack da exceção (truncados), a origem
 * (`window.onerror` / `unhandledrejection`), a release e o ambiente. O que ele
 * NÃO leva: requisição, cookies, usuário, sessão nem dado de tela — e telefone ou
 * e-mail que apareçam na mensagem saem mascarados.
 *
 * Nunca lança: reportar erro não pode virar uma segunda falha (mesma regra do
 * `src/lib/errorReporter.ts`, que segue sendo o relato interno para `audit_logs`).
 *
 * O irmão desta função nas edges é `supabase/functions/_shared/sentry.ts`; a
 * duplicação é de propósito, como em `postgrestFilters`/`ai-values`: o front não
 * importa de `supabase/functions`.
 */

// Global injetado pelo `define` do Vite; ausente em jsdom/vitest — o `typeof`
// guard evita ReferenceError (mesmo padrão de `src/lib/errorReporter.ts`).
declare const __ZAPP_BUILD_ID__: string | undefined;

const SENTRY_VERSION = 7;
const SENTRY_CLIENT = 'zapp-web/1.0.0';
const MAX_MESSAGE = 2000;
const MAX_STACK = 4000;
const MAX_PATH = 200;
const MAX_FRAMES = 30;
/** Sem resposta em 2 s o evento é descartado: rastreio não segura a navegação. */
const SEND_TIMEOUT_MS = 2000;

export interface SentryDsnParts {
  protocol: string;
  publicKey: string;
  host: string;
  projectId: string;
  prefix: string;
  raw: string;
}

export interface SentryFrame {
  filename: string;
  function?: string;
  lineno?: number;
  colno?: number;
}

export interface SentryContext {
  /** De onde o erro veio (`window.onerror`, `unhandledrejection`, ...). */
  source?: string;
}

export interface SentryEvent {
  event_id: string;
  timestamp: number;
  platform: string;
  level: string;
  environment: string;
  release?: string;
  tags: Record<string, string>;
  exception: {
    values: { type: string; value: string; stacktrace: { frames: SentryFrame[] } }[];
  };
}

function readEnv(name: string): string | null {
  try {
    const raw = (import.meta.env as Record<string, unknown> | undefined)?.[name];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function release(): string | undefined {
  return typeof __ZAPP_BUILD_ID__ === 'string' && __ZAPP_BUILD_ID__ ? __ZAPP_BUILD_ID__ : undefined;
}

/**
 * DSN do Sentry → endpoint do projeto. Formato: `<proto>://<chave>@<host>[/prefixo]/<projeto>`.
 * Recusa `http` fora de loopback: erro de produção não sai por canal aberto.
 */
export function parseSentryDsn(raw?: string | null): SentryDsnParts | null {
  const valor = (raw ?? '').trim();
  if (!valor) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
  if (!url.username) return null;
  const caminho = url.pathname.replace(/\/+$/, '');
  const corte = caminho.lastIndexOf('/');
  const projectId = caminho.slice(corte + 1);
  if (!/^[0-9]+$/.test(projectId)) return null;
  return {
    protocol: url.protocol.replace(':', ''),
    publicKey: url.username,
    host: url.host,
    projectId,
    prefix: corte > 0 ? caminho.slice(0, corte) : '',
    raw: valor,
  };
}

/** Endpoint de envelope do projeto (`/api/<projeto>/envelope/`). */
export function sentryStoreUrl(parts: SentryDsnParts): string {
  return `${parts.protocol}://${parts.host}${parts.prefix}/api/${parts.projectId}/envelope/`;
}

/**
 * Tira da mensagem o que não pode sair: e-mail e sequências longas de dígitos
 * (telefone, CPF/CNPJ — dado de cliente não sai da infra).
 */
export function maskSensitive(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\d{9,}/g, '[num]');
}

/** Id de evento do Sentry: 32 dígitos hexadecimais. */
export function newEventId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `at funcao (arquivo:linha:coluna)` → frames do Sentry (máx. MAX_FRAMES). */
export function parseStackFrames(stack: string): SentryFrame[] {
  const frames: SentryFrame[] = [];
  for (const linha of stack.split('\n')) {
    const m = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/.exec(linha);
    if (!m) continue;
    const [, fn, filename, line, col] = m;
    frames.push({
      filename: filename.slice(0, MAX_PATH),
      ...(fn ? { function: fn.slice(0, MAX_PATH) } : {}),
      lineno: Number(line),
      colno: Number(col),
    });
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames;
}

function describeError(error: unknown): { name: string; message: string; stack: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: maskSensitive(error.message || 'unknown').slice(0, MAX_MESSAGE),
      stack: (error.stack ?? '').slice(0, MAX_STACK),
    };
  }
  if (typeof error === 'string') {
    return { name: 'Error', message: maskSensitive(error || 'unknown').slice(0, MAX_MESSAGE), stack: '' };
  }
  let texto: string;
  try {
    texto = JSON.stringify(error) ?? 'unknown';
  } catch {
    texto = 'unknown';
  }
  return { name: 'Error', message: maskSensitive(texto).slice(0, MAX_MESSAGE), stack: '' };
}

export function buildEvent(error: unknown, context: SentryContext = {}, now = Date.now()): SentryEvent {
  const { name, message, stack } = describeError(error);
  const rel = release();
  return {
    event_id: newEventId(),
    timestamp: now / 1000,
    platform: 'javascript',
    level: 'error',
    environment: readEnv('VITE_SENTRY_ENVIRONMENT') ?? 'production',
    ...(rel ? { release: rel } : {}),
    tags: { runtime: 'browser', source: context.source ?? 'captureException' },
    exception: {
      values: [{ type: name, value: message, stacktrace: { frames: parseStackFrames(stack) } }],
    },
  };
}

/** Corpo do envelope: cabeçalho, item e evento, um JSON por linha. */
export function buildEnvelopeBody(
  event: SentryEvent,
  dsn: string,
  sentAt = new Date().toISOString(),
): string {
  const header = { event_id: event.event_id, dsn, sent_at: sentAt };
  const item = { type: 'event', content_type: 'application/json' };
  return `${JSON.stringify(header)}\n${JSON.stringify(item)}\n${JSON.stringify(event)}\n`;
}

let ativo = false;
let instalado = false;

function onGlobalError(event: ErrorEvent): void {
  void captureException(event.error ?? event.message, { source: 'window.onerror' });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  void captureException(event.reason, { source: 'unhandledrejection' });
}

/**
 * Liga o rastreio uma única vez (idempotente) e devolve se ele ficou ativo.
 * Sem DSN válido devolve `false` e não registra listener nenhum.
 */
export function initSentry(): boolean {
  if (instalado) return ativo;
  if (!parseSentryDsn(readEnv('VITE_SENTRY_DSN'))) return false;
  instalado = true;
  ativo = true;
  window.addEventListener('error', onGlobalError);
  window.addEventListener('unhandledrejection', onUnhandledRejection as EventListener);
  return true;
}

/** O rastreio está ligado nesta aba? */
export function sentryIsActive(): boolean {
  return ativo;
}

/** Desfaz o `initSentry` (uso em teste). */
export function resetSentryForTests(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener('error', onGlobalError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection as EventListener);
  }
  ativo = false;
  instalado = false;
}

/**
 * Reporta uma exceção. `true` = evento aceito pelo Sentry; `false` = rastreio
 * desligado (sem DSN), resposta de erro ou rede fora — e nada disso vira exceção.
 */
export async function captureException(
  error: unknown,
  context: SentryContext = {},
): Promise<boolean> {
  try {
    const parts = parseSentryDsn(readEnv('VITE_SENTRY_DSN'));
    if (!parts) return false; // desligado por padrão: nada é montado e nada é enviado
    const event = buildEvent(error, context);
    const resposta = await fetch(sentryStoreUrl(parts), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth':
          `Sentry sentry_version=${SENTRY_VERSION}, sentry_client=${SENTRY_CLIENT}, sentry_key=${parts.publicKey}`,
      },
      body: buildEnvelopeBody(event, parts.raw),
      keepalive: true,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    return resposta.ok;
  } catch {
    return false; // reportar erro nunca pode ser a segunda falha
  }
}
