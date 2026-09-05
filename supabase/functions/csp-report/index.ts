import { errorResponse, Logger, enforceRateLimit, getClientIP } from "../_shared/validation.ts";

// Receptor de violacoes de CSP (report-uri em vercel.json). Sem auth (o navegador
// envia sem JWT), sem CORS (report-uri nao passa por preflight), sem persistencia:
// o objetivo e ter os relatorios nos logs da edge para calibrar a policy antes de
// trocar Content-Security-Policy-Report-Only por Content-Security-Policy.
const MAX_BODY = 8 * 1024;
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

type Report = Record<string, unknown>;

function pickReport(body: unknown): Report | null {
  if (!body || typeof body !== "object") return null;
  // Formato legado (application/csp-report): { "csp-report": {...} }
  const legacy = (body as Record<string, unknown>)["csp-report"];
  if (legacy && typeof legacy === "object") return legacy as Report;
  // Reporting API (application/reports+json): [{ type: "csp-violation", body: {...} }]
  if (Array.isArray(body)) {
    const first = body.find((r) => r && typeof r === "object" && (r as Record<string, unknown>).type === "csp-violation");
    const inner = first ? (first as Record<string, unknown>).body : null;
    return inner && typeof inner === "object" ? (inner as Report) : null;
  }
  return null;
}

function truncate(value: unknown, max = 512): string {
  const s = typeof value === "string" ? value : value == null ? "" : String(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

Deno.serve(async (req) => {
  const log = new Logger("csp-report");

  if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

  const ip = getClientIP(req);
  const rl = await enforceRateLimit(`csp-report:${ip}`, 30, 60_000);
  if (!rl.allowed) return new Response(null, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const report = pickReport(body);
  if (!report) return new Response(null, { status: 400 });

  const ctx: Record<string, string> = {};
  for (const f of FIELDS) {
    // Reporting API usa camelCase (blockedURL, effectiveDirective...); o legado usa kebab-case.
    const camel = f.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()).replace("Uri", "URL");
    const v = report[f] ?? report[camel];
    if (v != null) ctx[f] = truncate(v, f === "original-policy" ? 256 : 512);
  }
  log.warn("csp violation", ctx);
  return new Response(null, { status: 204 });
});
