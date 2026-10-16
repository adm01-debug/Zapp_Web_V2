import {
  handleCors,
  jsonResponse,
  Logger,
  requireAuth,
  enforceRateLimit,
} from "../_shared/validation.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

/**
 * File Security Scanner — varredura (VirusTotal) dos arquivos que o AGENTE envia.
 *
 * Porta do scanner do V3 (`supabase/functions/file-security-scanner`) para as Edge
 * Functions do V2, com a mesma URL e o mesmo formato de resposta:
 *
 *   limpo  -> 200 { success: true, scanned: true, verdict: 'clean', scanId, message, details }
 *   pulado -> 200 { success: true, scanned: false, verdict: 'unknown', reason, message, details }
 *   erro   -> { error: true, contract: 'file-security-scanner', code, message,
 *               verdict, scanId: null, details: {} }  — `details` é SEMPRE objeto
 *
 * Códigos: 422 MALWARE_DETECTED, 403 SUSPICIOUS_FILE, 408 SCAN_TIMEOUT,
 * 502 SCAN_UNAVAILABLE, 400 INVALID_INPUT, 405 METHOD_NOT_ALLOWED,
 * 429 RATE_LIMITED, 500 INTERNAL_ERROR.
 *
 * Regra de decisão (cartão M28 / achado HZ1-02):
 *  - fail-CLOSED só no veredito: `malicious` (422) e `suspicious` (403) bloqueiam o
 *    envio; e também bloqueiam os casos em que NÃO houve veredito confiável —
 *    provedor inacessível (502 SCAN_UNAVAILABLE), resposta sem contadores (502) e
 *    análise que não concluiu na janela (408 SCAN_TIMEOUT). Arquivo não verificado
 *    não é arquivo aprovado; o front oferece "tentar novamente";
 *  - fail-OPEN só quando não houve varredura nenhuma: `VIRUSTOTAL_API_KEY`
 *    ausente/recusada ou arquivo acima do teto da API (32 MiB) => 200
 *    `{scanned:false, reason}`, com aviso no log, e o envio segue pelo fluxo atual
 *    da V2;
 *  - o SHA-256 é consultado ANTES de enviar bytes: hash conhecido resolve sem
 *    subir o arquivo (menos exposição e menos cota da API);
 *  - esta Edge NÃO persiste arquivo (o upload continua no fluxo da V2) e não
 *    grava veredito em tabela: o único registro é o ledger de auditoria;
 *  - o log carrega só `scanId`, `hash`, veredito e tamanho — nunca nome de
 *    cliente, telefone, conteúdo do arquivo ou a chave do provedor.
 */

export const CONTRACT = "file-security-scanner";

/** Teto de envio: a API `/api/v3/files` do VirusTotal recusa acima de 32 MiB. */
export const MAX_SCAN_FILE_BYTES = 32 * 1024 * 1024;

/** Cota por usuário: cada arquivo desconhecido é uma chamada paga ao provedor. */
export const SCANNER_RATE_LIMIT_MAX = 5;
export const SCANNER_RATE_LIMIT_WINDOW_MS = 60_000;

/** Espera entre tentativas de polling e teto de tentativas. */
export const VT_POLL_INTERVAL_MS = 2_000;
export const VT_POLL_MAX_ATTEMPTS = 10;

const VT_LOOKUP_TIMEOUT_MS = 10_000;
const VT_SUBMIT_TIMEOUT_MS = 30_000;
const VT_ANALYSIS_TIMEOUT_MS = 10_000;
const VT_FILES_URL = "https://www.virustotal.com/api/v3/files";
const VT_ANALYSES_URL = "https://www.virustotal.com/api/v3/analyses";

const UNAVAILABLE_MESSAGE = "Não foi possível verificar o arquivo agora. Tente novamente.";
const TIMEOUT_MESSAGE = "A verificação do arquivo não terminou a tempo. Tente novamente.";

export type ScanVerdict = "clean" | "malicious" | "suspicious" | "unknown";

/** Por que o arquivo passou sem varredura (só motivos de indisponibilidade/configuração). */
export type ScanSkipReason = "scanner_not_configured" | "scanner_auth_failed" | "file_too_large";

interface ScanStats {
  malicious: number;
  suspicious: number;
}

/**
 * Envelope de erro do contrato. Feito à mão (e não `errorResponse`) porque acima
 * de 500 o `errorResponse` troca o corpo por "Internal server error" e o
 * consumidor perderia `code`/`verdict`. A mensagem é SEMPRE capacidade escrita no
 * call site — `err.message` nunca chega ao cliente.
 */
function scanError(
  code: string,
  message: string,
  status: number,
  req: Request,
  extra: { verdict?: ScanVerdict; scanId?: string; details?: Record<string, unknown> } = {},
): Response {
  return jsonResponse(
    {
      error: true,
      contract: CONTRACT,
      code,
      message,
      verdict: extra.verdict ?? "unknown",
      scanId: extra.scanId ?? null,
      details: extra.details ?? {},
    },
    status,
    req,
  );
}

/** Resposta de arquivo que passou SEM varredura: não bloqueia o envio. */
function scanSkipped(
  reason: ScanSkipReason,
  message: string,
  req: Request,
  details: Record<string, unknown> = {},
): Response {
  return jsonResponse(
    { success: true, scanned: false, verdict: "unknown", reason, message, scanId: null, details },
    200,
    req,
  );
}

/**
 * Contadores do veredito, ou `null` quando a resposta não os prova.
 *
 * O provedor usa `stats` no payload da análise e `last_analysis_stats` no
 * relatório do arquivo (`/files/<hash>`) — os dois são a mesma coisa: contagem de
 * motores. Sem contadores não há veredito (e sem veredito não se aprova).
 */
export function readScanStats(attributes: unknown): ScanStats | null {
  if (!attributes || typeof attributes !== "object") return null;
  const source = attributes as { stats?: unknown; last_analysis_stats?: unknown };
  const stats = source.stats ?? source.last_analysis_stats;
  if (!stats || typeof stats !== "object") return null;
  const malicious = (stats as { malicious?: unknown }).malicious;
  const suspicious = (stats as { suspicious?: unknown }).suspicious;
  if (typeof malicious !== "number" || !Number.isFinite(malicious)) return null;
  if (typeof suspicious !== "number" || !Number.isFinite(suspicious)) return null;
  return { malicious, suspicious };
}

/** Veredito a partir dos contadores. `clean` é o único caminho que libera o envio. */
export function verdictFromStats(stats: ScanStats): ScanVerdict {
  if (stats.malicious > 0) return "malicious";
  if (stats.suspicious > 0) return "suspicious";
  return "clean";
}

/** SHA-256 em hex minúsculo — é a chave de consulta do provedor. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface ScanUploadDenial {
  code: string;
  message: string;
  status: number;
  details: Record<string, unknown>;
}

export type ScanUploadKind = "ok" | "denied" | "too_large";

/** Resultado do portão de entrada: aceito, recusado (400) ou grande demais (segue sem varredura). */
export interface ScanUploadValidation {
  kind: ScanUploadKind;
  file?: File;
  denial?: ScanUploadDenial;
  details?: Record<string, unknown>;
}

/**
 * Portão do upload, puro e testável nas bordas (tamanho anunciado, tamanho real,
 * arquivo ausente/vazio). O teto estourado NÃO bloqueia: vira `too_large` e o
 * envio segue sem varredura (fail-open mandado pelo cartão). Arquivo ausente ou
 * vazio é entrada inválida (400).
 *
 * Contrato de entrada: este endpoint recebe `multipart/form-data` (lido com
 * `req.formData()` no handler) e por isso NÃO passa pelo validador JSON
 * compartilhado (`parseBody`/`parseOrReject` de `_shared/schemas.ts` e
 * `_shared/contract-kit.ts`), que só valida corpo JSON já desserializado —
 * `File`/`Blob` não têm representação em schema zod JSON. A validação estrita
 * vive aqui: arquivo obrigatório, não vazio e dentro do teto de 32 MiB.
 */
export function validateScanUpload(input: { announcedLength?: number; file: unknown }): ScanUploadValidation {
  const { announcedLength, file } = input;

  if (
    typeof announcedLength === "number" && Number.isFinite(announcedLength) &&
    announcedLength > MAX_SCAN_FILE_BYTES
  ) {
    return {
      kind: "too_large",
      details: { maxBytes: MAX_SCAN_FILE_BYTES, announcedLength, byteLength: null },
    };
  }

  const candidate = file as { size?: unknown; arrayBuffer?: unknown } | null;
  if (
    !candidate || typeof candidate !== "object" ||
    typeof candidate.arrayBuffer !== "function" ||
    typeof candidate.size !== "number" || !Number.isFinite(candidate.size)
  ) {
    return {
      kind: "denied",
      denial: {
        code: "INVALID_INPUT",
        message: "Nenhum arquivo enviado para verificação.",
        status: 400,
        details: { field: "file" },
      },
    };
  }

  if (candidate.size === 0) {
    return {
      kind: "denied",
      denial: { code: "INVALID_INPUT", message: "Arquivo vazio.", status: 400, details: { field: "file" } },
    };
  }

  if (candidate.size > MAX_SCAN_FILE_BYTES) {
    return {
      kind: "too_large",
      details: { maxBytes: MAX_SCAN_FILE_BYTES, announcedLength: null, byteLength: candidate.size },
    };
  }

  return { kind: "ok", file: candidate as unknown as File };
}

/** Saída da varredura: veredito, bloqueio sem veredito ou varredura não feita. */
export interface ScanOutcome {
  kind: "verdict" | "blocked" | "skipped";
  verdict: ScanVerdict;
  details: Record<string, unknown>;
  stats?: ScanStats;
  scanId?: string;
  source?: "hash" | "analysis";
  code?: string;
  message?: string;
  status?: number;
  reason?: ScanSkipReason;
}

function blockedOutcome(
  code: string,
  message: string,
  status: number,
  details: Record<string, unknown>,
  scanId?: string,
): ScanOutcome {
  return { kind: "blocked", verdict: "unknown", code, message, status, details, scanId };
}

function skippedOutcome(
  reason: ScanSkipReason,
  message: string,
  details: Record<string, unknown>,
): ScanOutcome {
  return { kind: "skipped", verdict: "unknown", reason, message, details };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readJson(response: Response): Promise<unknown> {
  return await response.json().catch(() => null);
}

/**
 * Varredura do arquivo: consulta o relatório por hash e só envia os bytes se o
 * hash for desconhecido. Nenhum ramo de erro aqui aprova arquivo: ou devolve
 * veredito, ou bloqueia (408/502), ou declara que não houve varredura (skipped).
 */
async function runScan(args: {
  file: File;
  hash: string;
  apiKey: string;
  log: Logger;
  sleep: (ms: number) => Promise<void>;
}): Promise<ScanOutcome> {
  const { file, hash, apiKey, log, sleep } = args;
  const baseDetails: Record<string, unknown> = { hash, byteLength: file.size };

  // 1. Relatório por hash: hash conhecido resolve sem subir bytes ao provedor.
  let lookup: Response;
  try {
    lookup = await fetch(`${VT_FILES_URL}/${hash}`, {
      headers: { "x-apikey": apiKey },
      signal: AbortSignal.timeout(VT_LOOKUP_TIMEOUT_MS),
    });
  } catch (err) {
    log.warn("consulta por hash indisponivel", { hash, error: describe(err) });
    return blockedOutcome("SCAN_UNAVAILABLE", UNAVAILABLE_MESSAGE, 502, baseDetails);
  }

  if (lookup.status === 401 || lookup.status === 403) {
    log.warn("provedor recusou a chave: sem varredura", { hash, status: lookup.status });
    return skippedOutcome("scanner_auth_failed", "Arquivo enviado sem verificação de segurança: verificador indisponível.", {
      ...baseDetails, status: lookup.status,
    });
  }

  if (lookup.status === 200) {
    const attributes = (await readJson(lookup) as { data?: { attributes?: unknown } } | null)?.data?.attributes;
    const stats = readScanStats(attributes);
    if (!stats) {
      // Relatório existe mas não prova veredito: não é limpo.
      log.error("relatorio por hash sem contadores", { hash });
      return blockedOutcome("SCAN_UNAVAILABLE", UNAVAILABLE_MESSAGE, 502, { ...baseDetails, source: "hash" });
    }
    log.info("veredito por hash", { hash, byteLength: file.size, ...stats });
    return {
      kind: "verdict",
      verdict: verdictFromStats(stats),
      stats,
      scanId: hash,
      source: "hash",
      details: { ...baseDetails, source: "hash", malicious: stats.malicious, suspicious: stats.suspicious },
    };
  }

  if (lookup.status !== 404) {
    log.warn("consulta por hash falhou", { hash, status: lookup.status });
    return blockedOutcome("SCAN_UNAVAILABLE", UNAVAILABLE_MESSAGE, 502, baseDetails);
  }

  // 2. Hash desconhecido: aí sim o arquivo sai do sistema (exceção aprovada pelo
  //    dono em 13/10/2026, só para este scanner e só para envio de agente).
  const vtForm = new FormData();
  vtForm.append("file", file, file.name);

  let analysisId: string | undefined;
  try {
    const submit = await fetch(VT_FILES_URL, {
      method: "POST",
      headers: { "x-apikey": apiKey },
      body: vtForm,
      signal: AbortSignal.timeout(VT_SUBMIT_TIMEOUT_MS),
    });

    if (submit.status === 401 || submit.status === 403) {
      log.warn("provedor recusou a chave no envio: sem varredura", { hash, status: submit.status });
      return skippedOutcome("scanner_auth_failed", "Arquivo enviado sem verificação de segurança: verificador indisponível.", {
        ...baseDetails, status: submit.status,
      });
    }
    if (!submit.ok) {
      log.error("envio ao provedor falhou", { hash, status: submit.status });
      return blockedOutcome("SCAN_UNAVAILABLE", UNAVAILABLE_MESSAGE, 502, baseDetails);
    }

    const id = (await readJson(submit) as { data?: { id?: unknown } } | null)?.data?.id;
    if (typeof id !== "string" || id.length === 0) {
      log.error("provedor sem identificador de analise", { hash });
      return blockedOutcome("SCAN_UNAVAILABLE", UNAVAILABLE_MESSAGE, 502, baseDetails);
    }
    analysisId = id;
  } catch (err) {
    log.error("envio ao provedor indisponivel", { hash, error: describe(err) });
    return blockedOutcome("SCAN_UNAVAILABLE", UNAVAILABLE_MESSAGE, 502, baseDetails);
  }

  // 3. Polling da análise até o provedor fechar o veredito.
  for (let attempt = 0; attempt < VT_POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(VT_POLL_INTERVAL_MS);

    let payload: unknown = null;
    try {
      const analysis = await fetch(`${VT_ANALYSES_URL}/${analysisId}`, {
        headers: { "x-apikey": apiKey },
        signal: AbortSignal.timeout(VT_ANALYSIS_TIMEOUT_MS),
      });
      if (!analysis.ok) {
        log.warn("leitura da analise falhou", { scanId: analysisId, status: analysis.status });
        continue;
      }
      payload = await readJson(analysis);
    } catch (err) {
      log.warn("leitura da analise indisponivel", { scanId: analysisId, error: describe(err) });
      continue;
    }

    const attributes = (payload as { data?: { attributes?: unknown } } | null)?.data?.attributes;
    if (!attributes || typeof attributes !== "object") {
      log.warn("analise sem atributos", { scanId: analysisId });
      continue;
    }
    if ((attributes as { status?: unknown }).status !== "completed") continue;

    const stats = readScanStats(attributes);
    if (!stats) {
      // Fechou como "completed" e não trouxe contadores: não dá para dizer que é limpo.
      log.error("analise concluida sem contadores", { scanId: analysisId });
      return blockedOutcome("SCAN_UNAVAILABLE", UNAVAILABLE_MESSAGE, 502, { ...baseDetails, source: "analysis" }, analysisId);
    }

    log.info("veredito por analise", { scanId: analysisId, hash, byteLength: file.size, ...stats });
    return {
      kind: "verdict",
      verdict: verdictFromStats(stats),
      stats,
      scanId: analysisId,
      source: "analysis",
      details: { ...baseDetails, source: "analysis", malicious: stats.malicious, suspicious: stats.suspicious },
    };
  }

  log.warn("analise nao concluiu na janela de polling", { scanId: analysisId, hash });
  return blockedOutcome("SCAN_TIMEOUT", TIMEOUT_MESSAGE, 408, baseDetails, analysisId);
}

/**
 * Ledger de auditoria (padrão `audit_logs` de `migrate-media-storage`).
 * Best-effort de propósito e nunca lança: é registro, não portão — o veredito já
 * está decidido quando ela roda.
 */
async function recordScanAudit(
  log: Logger,
  userId: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      log.warn("auditoria nao registrada: credencial de servico ausente");
      return;
    }
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await admin.from("audit_logs").insert({
      user_id: userId,
      action: "file_security_scan",
      entity_type: "file_scan",
      details,
    });
    if (error) log.warn("auditoria nao registrada", { error: error.message });
  } catch (err) {
    log.warn("auditoria nao registrada", { error: describe(err) });
  }
}

export interface ScannerDeps {
  /** Pausa entre tentativas de polling (injetável: o teste não espera 20 s). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Handler da Edge. Ordem: CORS -> autenticação -> limite por usuário -> método ->
 * teto anunciado -> portão (arquivo/tamanho) -> chave do provedor -> varredura.
 */
export async function handleFileSecurityScanner(
  req: Request,
  deps: ScannerDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger(CONTRACT);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  try {
    // Autenticação ANTES de qualquer efeito (provedor pago, auditoria).
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    const userId = auth.userId;

    const rl = await enforceRateLimit(
      `${CONTRACT}:${userId}`,
      SCANNER_RATE_LIMIT_MAX,
      SCANNER_RATE_LIMIT_WINDOW_MS,
    );
    if (!rl.allowed) {
      return scanError("RATE_LIMITED", "Muitas verificações em sequência. Tente novamente em instantes.", 429, req);
    }

    if (req.method !== "POST") {
      return scanError("METHOD_NOT_ALLOWED", "Apenas requisições POST são permitidas.", 405, req);
    }

    // Teto pelo `content-length` ANTES de `req.formData()`: o corpo abusivo não é
    // materializado. O cabeçalho pode mentir para baixo — o `size` real do File
    // decide no portão, que também devolve `too_large` (sem varredura).
    const announced = Number(req.headers.get("content-length") ?? "");
    if (Number.isFinite(announced) && announced > MAX_SCAN_FILE_BYTES) {
      log.warn("content-length acima do teto: sem varredura", { byteLength: announced });
      await recordScanAudit(log, userId, {
        verdict: "unknown",
        reason: "file_too_large",
        byteLength: announced,
      });
      return scanSkipped(
        "file_too_large",
        "Arquivo enviado sem verificação de segurança: acima do limite do verificador.",
        req,
        { maxBytes: MAX_SCAN_FILE_BYTES, byteLength: announced },
      );
    }

    const formData = await req.formData();
    const checked = validateScanUpload({ announcedLength: announced, file: formData.get("file") });
    if (checked.kind === "denied") {
      const denial = checked.denial;
      log.warn("upload recusado", { code: denial?.code });
      return scanError(
        denial?.code ?? "INVALID_INPUT",
        denial?.message ?? "Requisição inválida.",
        denial?.status ?? 400,
        req,
        { details: denial?.details },
      );
    }
    if (checked.kind === "too_large") {
      log.warn("arquivo acima do teto: sem varredura", { byteLength: checked.details?.byteLength });
      await recordScanAudit(log, userId, {
        verdict: "unknown",
        reason: "file_too_large",
        byteLength: checked.details?.byteLength ?? null,
      });
      return scanSkipped(
        "file_too_large",
        "Arquivo enviado sem verificação de segurança: acima do limite do verificador.",
        req,
        checked.details ?? {},
      );
    }

    const file = checked.file as File;
    const apiKey = Deno.env.get("VIRUSTOTAL_API_KEY");
    if (!apiKey) {
      // Ausência de configuração não bloqueia envio: o cartão manda fail-open aqui.
      log.warn("VIRUSTOTAL_API_KEY ausente: sem varredura", { byteLength: file.size });
      await recordScanAudit(log, userId, {
        verdict: "unknown",
        reason: "scanner_not_configured",
        byteLength: file.size,
      });
      return scanSkipped(
        "scanner_not_configured",
        "Arquivo enviado sem verificação de segurança: verificador indisponível.",
        req,
        { maxBytes: MAX_SCAN_FILE_BYTES, byteLength: file.size },
      );
    }

    const hash = await sha256Hex(await file.arrayBuffer());
    log.info("iniciando varredura", { hash, byteLength: file.size });

    const outcome = await runScan({ file, hash, apiKey, log, sleep });

    if (outcome.kind === "skipped") {
      await recordScanAudit(log, userId, {
        verdict: "unknown",
        reason: outcome.reason ?? "scanner_not_configured",
        hash,
        byteLength: file.size,
      });
      return scanSkipped(
        outcome.reason ?? "scanner_not_configured",
        outcome.message ?? "Arquivo enviado sem verificação de segurança.",
        req,
        outcome.details,
      );
    }

    if (outcome.kind === "blocked") {
      log.warn("varredura sem veredito: envio bloqueado", { code: outcome.code, hash, scanId: outcome.scanId });
      await recordScanAudit(log, userId, {
        verdict: "unknown",
        code: outcome.code,
        hash,
        byteLength: file.size,
        scanId: outcome.scanId ?? null,
        source: outcome.details.source ?? null,
      });
      return scanError(
        outcome.code ?? "SCAN_UNAVAILABLE",
        outcome.message ?? UNAVAILABLE_MESSAGE,
        outcome.status ?? 502,
        req,
        { verdict: "unknown", scanId: outcome.scanId, details: outcome.details },
      );
    }

    await recordScanAudit(log, userId, {
      verdict: outcome.verdict,
      hash,
      byteLength: file.size,
      scanId: outcome.scanId ?? null,
      source: outcome.source ?? null,
      malicious: outcome.stats?.malicious ?? null,
      suspicious: outcome.stats?.suspicious ?? null,
    });

    if (outcome.verdict === "malicious") {
      return scanError(
        "MALWARE_DETECTED",
        "Arquivo bloqueado: a verificação de segurança encontrou ameaça.",
        422,
        req,
        { verdict: "malicious", scanId: outcome.scanId, details: outcome.details },
      );
    }

    if (outcome.verdict === "suspicious") {
      return scanError(
        "SUSPICIOUS_FILE",
        "Arquivo bloqueado: a verificação de segurança encontrou indícios suspeitos.",
        403,
        req,
        { verdict: "suspicious", scanId: outcome.scanId, details: outcome.details },
      );
    }

    return jsonResponse(
      {
        success: true,
        scanned: true,
        verdict: "clean",
        scanId: outcome.scanId ?? null,
        message: "Arquivo verificado: nenhuma ameaça encontrada.",
        details: outcome.details,
      },
      200,
      req,
    );
  } catch (error) {
    log.error("erro inesperado na varredura", { error: describe(error) });
    return scanError("INTERNAL_ERROR", "Erro interno na verificação do arquivo.", 500, req);
  }
}

// `import.meta.main` (mesmo padrão das outras Edges): o teste importa o handler
// sem subir servidor.
if (import.meta.main) {
  Deno.serve((req) => handleFileSecurityScanner(req));
}
