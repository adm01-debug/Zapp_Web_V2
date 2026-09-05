import { errorResponse, handleCors, Logger, enforceRateLimit, getClientIP } from "../_shared/validation.ts";

// Receptor de violacoes de CSP (report-uri em vercel.json). Sem auth (o navegador
// envia sem JWT), preflight so para o smoke de deploy, sem persistencia:
// o objetivo e ter os relatorios nos logs da edge para calibrar a policy antes de
// trocar Content-Security-Policy-Report-Only por Content-Security-Policy.
const MAX_BODY = 8 * 1024;
const MAX_REPORTS = 10;
const FIELDS = [
  "document-uri",
  "violated-directive",
  "effective-directive",
  "blocked-uri",
  "source-file",
  "line-number",
  "disposition",
  "original-policy",
] as const;
// Campos com URL: query e fragmento saem do log (podem carregar code OAuth, token de storage).
const URL_FIELDS = new Set<string>(["document-uri", "blocked-uri", "source-file"]);

type Report = Record<string, unknown>;

// Le no maximo MAX_BODY bytes; acima disso cancela o stream em vez de bufferizar tudo.
async function readBounded(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

function collectReports(body: unknown): Report[] {
  if (!body || typeof body !== "object") return [];
  // Formato legado (application/csp-report): { "csp-report": {...} }
  const legacy = (body as Record<string, unknown>)["csp-report"];
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) return [legacy as Report];
  // Reporting API (application/reports+json): [{ type: "csp-violation", body: {...} }, ...]
  if (!Array.isArray(body)) return [];
  const out: Report[] = [];
  for (const entry of body) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.type !== "csp-violation" || !e.body || typeof e.body !== "object") continue;
    out.push(e.body as Report);
    if (out.length >= MAX_REPORTS) break;
  }
  return out;
}

// So escalares viram texto: objeto com toString hostil nao chega a ser convertido.
function scalar(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function redactUrl(value: string): string {
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname}`;
  } catch {
    // "inline", "eval", "data", "blob" etc. nao sao URLs absolutas.
    return value.split(/[?#]/)[0];
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

Deno.serve(async (req) => {
  const log = new Logger("csp-report");

  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

  const ip = getClientIP(req);
  const rl = await enforceRateLimit(`csp-report:${ip}`, 30, 60_000);
  if (!rl.allowed) return new Response(null, { status: 429 });

  const raw = await readBounded(req);
  if (raw === null) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const reports = collectReports(body);
  if (reports.length === 0) return new Response(null, { status: 400 });

  for (const report of reports) {
    const ctx: Record<string, string> = {};
    for (const f of FIELDS) {
      // Reporting API usa camelCase (blockedURL, effectiveDirective...); o legado usa kebab-case.
      const camel = f.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()).replace("Uri", "URL");
      const v = scalar(report[f] ?? report[camel]);
      if (v === null) continue;
      const clean = URL_FIELDS.has(f) ? redactUrl(v) : v;
      ctx[f] = truncate(clean, f === "original-policy" ? 256 : 512);
    }
    log.warn("csp violation", ctx);
  }
  return new Response(null, { status: 204 });
});
