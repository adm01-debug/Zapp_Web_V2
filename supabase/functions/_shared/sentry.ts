/**
 * Sentry nas Edge Functions — itens 031-032 do plano de paridade (cartão SL-056).
 *
 * Por que existe: o inventário de 07/10/2026 mede "Sem Sentry.init no front/edges".
 * O V2 não aceita dependência nova, então o protocolo de envelope do Sentry
 * (cabeçalho + item + evento, um POST por evento) é falado aqui mesmo, sem SDK.
 *
 * DESLIGADO POR PADRÃO — e é essa a garantia que importa: sem DSN no ambiente
 * (`SENTRY_DSN_EDGE`, ou `SENTRY_DSN`) nada é montado e nada é enviado; as
 * funções devolvem `false` sem tocar em `fetch`. Ligar o rastreio é decisão do
 * dono (qual Sentry: SaaS ou GlitchTip self-hosted) — ele é quem põe o DSN no
 * secret do projeto; até então nenhuma informação sai do sistema.
 *
 * O que o evento leva: tipo, mensagem e stack da exceção (truncados), a edge
 * dona, o id de correlação (`x-request-id`) e a release. O que ele NÃO leva:
 * requisição, cabeçalhos, cookies, usuário, corpo de mensagem e qualquer dado de
 * cliente — e telefone/e-mail que apareçam na mensagem saem mascarados.
 *
 * Nunca lança: reportar erro não pode virar uma segunda falha (mesma regra do
 * `src/lib/errorReporter.ts` no front).
 */

/** Versão do protocolo de envelope e nome que aparece no `X-Sentry-Auth`. */
const SENTRY_VERSION = 7;
const SENTRY_CLIENT = "zapp-edge/1.0.0";
/** Tetos do que sai: mensagem, stack, nome de arquivo/função e nº de frames. */
const MAX_MESSAGE = 2000;
const MAX_STACK = 4000;
const MAX_PATH = 200;
const MAX_FRAMES = 30;
/** Sem resposta em 2 s o evento é descartado: rastreio não pode segurar a edge. */
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
  /** Edge que reporta (tag `edge_function`). */
  fn?: string;
  /** Id de correlação da requisição (etapa 034), vira a tag `request_id`. */
  requestId?: string;
  /** Injeção para teste; em produção é o `fetch` global. */
  fetcher?: typeof fetch;
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

/**
 * `Deno.env` sem `--allow-env` jogaria exceção: sem permissão de ambiente o
 * rastreio simplesmente segue desligado, como quando a variável não existe.
 */
function readEnv(name: string): string | null {
  try {
    return Deno.env.get(name) ?? null;
  } catch {
    return null;
  }
}

/** DSN do ambiente das edges; `SENTRY_DSN_EDGE` (nome do plano) tem precedência. */
export function sentryDsnFromEnv(): string | null {
  return readEnv("SENTRY_DSN_EDGE") ?? readEnv("SENTRY_DSN");
}

/**
 * DSN do Sentry → endpoint do projeto. Formato: `<proto>://<chave>@<host>[/prefixo]/<projeto>`.
 * Recusa `http` fora de loopback: erro de produção não sai por canal aberto.
 */
export function parseSentryDsn(raw?: string | null): SentryDsnParts | null {
  const valor = (raw ?? "").trim();
  if (!valor) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  if (!url.username) return null;
  const caminho = url.pathname.replace(/\/+$/, "");
  const corte = caminho.lastIndexOf("/");
  const projectId = caminho.slice(corte + 1);
  if (!/^[0-9]+$/.test(projectId)) return null;
  return {
    protocol: url.protocol.replace(":", ""),
    publicKey: url.username,
    host: url.host,
    projectId,
    prefix: corte > 0 ? caminho.slice(0, corte) : "",
    raw: valor,
  };
}

/** Endpoint de envelope do projeto (`/api/<projeto>/envelope/`). */
export function sentryStoreUrl(parts: SentryDsnParts): string {
  return `${parts.protocol}://${parts.host}${parts.prefix}/api/${parts.projectId}/envelope/`;
}

/** Há DSN válido no ambiente? Falso = rastreio desligado, nada é enviado. */
export function isSentryEnabled(raw = sentryDsnFromEnv()): boolean {
  return parseSentryDsn(raw) !== null;
}

/**
 * Tira da mensagem o que não pode sair: e-mail e sequências longas de dígitos
 * (telefone, CPF/CNPJ, ids de conversa que apareçam no texto do erro).
 */
export function maskSensitive(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\d{9,}/g, "[num]");
}

/** Id de evento do Sentry: 32 dígitos hexadecimais. */
export function newEventId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `at funcao (arquivo:linha:coluna)` → frames do Sentry (máx. MAX_FRAMES). */
export function parseStackFrames(stack: string): SentryFrame[] {
  const frames: SentryFrame[] = [];
  for (const linha of stack.split("\n")) {
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

/** Qualquer coisa jogada para fora vira `{name, message, stack}` já mascarado. */
function describeError(error: unknown): { name: string; message: string; stack: string } {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: maskSensitive(error.message || "unknown").slice(0, MAX_MESSAGE),
      stack: (error.stack ?? "").slice(0, MAX_STACK),
    };
  }
  if (typeof error === "string") {
    return { name: "Error", message: maskSensitive(error || "unknown").slice(0, MAX_MESSAGE), stack: "" };
  }
  let texto: string;
  try {
    texto = JSON.stringify(error) ?? "unknown";
  } catch {
    texto = "unknown";
  }
  return { name: "Error", message: maskSensitive(texto).slice(0, MAX_MESSAGE), stack: "" };
}

export function buildEvent(error: unknown, context: SentryContext = {}, now = Date.now()): SentryEvent {
  const { name, message, stack } = describeError(error);
  const tags: Record<string, string> = { runtime: "deno" };
  if (context.fn) tags.edge_function = context.fn;
  if (context.requestId) tags.request_id = context.requestId;
  const release = readEnv("SENTRY_RELEASE");
  return {
    event_id: newEventId(),
    timestamp: now / 1000,
    platform: "javascript",
    level: "error",
    environment: readEnv("SENTRY_ENVIRONMENT") ?? "production",
    ...(release ? { release } : {}),
    tags,
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
  const item = { type: "event", content_type: "application/json" };
  return `${JSON.stringify(header)}\n${JSON.stringify(item)}\n${JSON.stringify(event)}\n`;
}

function authHeader(parts: SentryDsnParts): string {
  return `Sentry sentry_version=${SENTRY_VERSION}, sentry_client=${SENTRY_CLIENT}, sentry_key=${parts.publicKey}`;
}

/**
 * Reporta uma exceção. `true` = evento aceito pelo Sentry; `false` = rastreio
 * desligado (sem DSN), resposta de erro ou rede fora — e nada disso vira exceção.
 */
export async function captureSentryError(
  error: unknown,
  context: SentryContext = {},
): Promise<boolean> {
  try {
    const parts = parseSentryDsn(sentryDsnFromEnv());
    if (!parts) return false; // desligado por padrão: nada é montado e nada é enviado
    const event = buildEvent(error, context);
    const fetcher = context.fetcher ?? fetch;
    const resposta = await fetcher(sentryStoreUrl(parts), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": authHeader(parts),
      },
      body: buildEnvelopeBody(event, parts.raw),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    return resposta.ok;
  } catch {
    return false; // reportar erro nunca pode ser a segunda falha
  }
}

/**
 * Embrulho para edges cujo erro sobe até o `Deno.serve` (as que NÃO têm catch
 * próprio). Captura e REPASSA o erro — a resposta e o ramo de erro continuam
 * exatamente como eram.
 */
export function withSentry<T extends Request>(
  handler: (req: T) => Promise<Response>,
  opts: { fn: string; fetcher?: typeof fetch },
): (req: T) => Promise<Response> {
  return async (req: T) => {
    try {
      return await handler(req);
    } catch (error) {
      await captureSentryError(error, {
        fn: opts.fn,
        requestId: req.headers.get("x-request-id") ?? undefined,
        fetcher: opts.fetcher,
      });
      throw error;
    }
  };
}
