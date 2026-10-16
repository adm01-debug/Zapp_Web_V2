// M28 (achado HZ1-02) — testes do scanner de arquivos (`file-security-scanner`).
//
// Porte do scanner do Zapp Web V3 para as Edge Functions do V2, com as decisões do
// cartão: hash (SHA-256) consultado ANTES de enviar bytes, fail-open só para
// ausência de configuração / arquivo acima do teto da API, fail-closed para
// veredito malicioso/suspeito E para "não deu para verificar", nada de persistir
// o arquivo.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//     --allow-net=127.0.0.1 supabase/functions/file-security-scanner/index.test.ts
//
// `fetch` é mockado (nenhuma rede): `/auth/v1/user` (requireAuth),
// `/rest/v1/rpc/resolve_network_policy` (política de rede), `consume_rate_limit`
// (enforceRateLimit), `/rest/v1/audit_logs` (ledger) e `virustotal.com` (provedor).

import {
  MAX_SCAN_FILE_BYTES,
  VT_POLL_MAX_ATTEMPTS,
  handleFileSecurityScanner,
  readScanStats,
  sha256Hex,
  validateScanUpload,
  verdictFromStats,
} from "./index.ts";

function assert(condition: unknown, message = "condição falhou"): asserts condition {
  if (!condition) throw new Error(message);
}

const URL_FN = "https://stub.supabase.co/functions/v1/file-security-scanner";

interface Call {
  url: string;
  method: string;
  body?: unknown;
}

interface Route {
  match: string;
  make: (url: string) => Response;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResp(status: number): Response {
  return new Response(null, { status });
}

/**
 * Cada requisição autenticada recebe um usuário próprio: o contador local de
 * `checkRateLimit` vive no isolado e negaria os testes seguintes se o id fosse
 * fixo (o 6º teste já viria 429 sem ter feito nada de errado).
 */
let usuarioSeq = 0;

const ROTA_AUTH: Route = {
  match: "/auth/v1/user",
  make: () =>
    jsonResp({
      id: `10000000-0000-0000-0000-${String(++usuarioSeq).padStart(12, "0")}`,
      aud: "authenticated",
    }),
};

const ROTA_RATE_LIMIT_OK: Route = {
  match: "/rest/v1/rpc/consume_rate_limit",
  make: () => jsonResp([{ allowed: true, remaining: 4 }]),
};

const ROTA_RATE_LIMIT_NEGADO: Route = {
  match: "/rest/v1/rpc/consume_rate_limit",
  make: () => jsonResp([{ allowed: false, remaining: 0 }]),
};

const ROTA_AUDIT: Route = {
  match: "/rest/v1/audit_logs",
  make: () => emptyResp(201),
};

/** Relatório por hash: `stats` é o veredito conhecido do provedor. */
function rotaRelatorio(
  status: number,
  stats?: { malicious: number; suspicious: number },
): Route {
  return {
    match: "/api/v3/files/",
    make: () =>
      status === 200
        ? jsonResp({ data: { id: "relatorio-1", attributes: { last_analysis_stats: stats } } })
        : jsonResp({ error: { code: status === 404 ? "NotFoundError" : "ForbiddenError" } }, status),
  };
}

const ROTA_SUBMIT: Route = {
  match: "/api/v3/files",
  make: () => jsonResp({ data: { id: "analise-1" } }, 200),
};

const ROTA_SUBMIT_NEGADO: Route = {
  match: "/api/v3/files",
  make: () => jsonResp({ error: { code: "ForbiddenError" } }, 401),
};

const ROTA_SUBMIT_ERRO: Route = {
  match: "/api/v3/files",
  make: () => jsonResp({ error: { code: "InternalError" } }, 500),
};

function rotaAnalise(status: string, stats?: { malicious: number; suspicious: number }): Route {
  return {
    match: "/api/v3/analyses/",
    make: () =>
      jsonResp({
        data: {
          id: "analise-1",
          attributes: status === "completed" ? { status, stats } : { status },
        },
      }),
  };
}

function withStub(routes: Route[]) {
  const original = globalThis.fetch;
  const calls: Call[] = [];

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ url, method, body: init?.body });

    if (url.includes("/rest/v1/rpc/resolve_network_policy")) {
      return Promise.resolve(jsonResp({ allowed: true }));
    }

    const route = routes.find((candidate) => url.includes(candidate.match));
    if (!route) {
      return Promise.resolve(jsonResp({ message: `rota nao stubada: ${url}` }, 599));
    }
    return Promise.resolve(route.make(url));
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VIRUSTOTAL_API_KEY",
] as const;

const ENV_OK = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-de-teste",
  VIRUSTOTAL_API_KEY: "vt-key-de-teste",
};

const ENV_SEM_CHAVE = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-de-teste",
};

function withEnv(values: Record<string, string>, fn: () => Promise<void>) {
  const saved = ENV_KEYS.map((key) => [key, Deno.env.get(key)] as const);
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

function scannerRequest(
  form: FormData | null,
  { withAuth = true, method = "POST", extraHeaders = {} as Record<string, string> } = {},
): Request {
  const headers: Record<string, string> = { ...extraHeaders };
  if (withAuth) headers.Authorization = "Bearer token-de-teste";
  return new Request(URL_FN, {
    method,
    headers,
    body: method === "POST" && form ? form : undefined,
  });
}

function uploadForm(file: File): FormData {
  const form = new FormData();
  form.append("file", file, file.name);
  return form;
}

function txtFile(name = "contrato.pdf", conteudo = "conteudo"): File {
  return new File([conteudo], name, { type: "application/pdf" });
}

/**
 * `File` de mentira para as bordas de tamanho: só o que o portão usa (`size` e
 * `arrayBuffer`), sem alocar 32 MiB no teste.
 */
function fakeFile(size: number): File {
  return { size, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) } as unknown as File;
}

function chamadas(calls: Call[], match: string): Call[] {
  return calls.filter((call) => call.url.includes(match));
}

/** Envios do arquivo ao provedor: só o POST em `/api/v3/files`. */
function envios(calls: Call[]): Call[] {
  return calls.filter((call) => call.method === "POST" && call.url.endsWith("/api/v3/files"));
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return await res.json() as Record<string, unknown>;
}

const ROTAS_PADRAO = [ROTA_AUTH, ROTA_RATE_LIMIT_OK, ROTA_AUDIT];

Deno.test("M28: sem bearer -> 401 e nada toca o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub(ROTAS_PADRAO);
    try {
      const res = await handleFileSecurityScanner(
        scannerRequest(uploadForm(txtFile()), { withAuth: false }),
      );
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(chamadas(stub.calls, "virustotal.com").length === 0, "provedor não podia ser chamado");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: cota por usuário estourada -> 429 RATE_LIMITED sem tocar o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([ROTA_AUTH, ROTA_RATE_LIMIT_NEGADO, ROTA_AUDIT]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 429, `esperado 429, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.code === "RATE_LIMITED", `código veio ${body.code}`);
      assert(chamadas(stub.calls, "virustotal.com").length === 0, "provedor não podia ser chamado");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: método diferente de POST -> 405 METHOD_NOT_ALLOWED", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub(ROTAS_PADRAO);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(null, { method: "GET" }));
      assert(res.status === 405, `esperado 405, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.code === "METHOD_NOT_ALLOWED", `código veio ${body.code}`);
      assert(chamadas(stub.calls, "virustotal.com").length === 0, "provedor não podia ser chamado");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: content-length acima do teto -> scanned:false (sem varredura) e sem corpo lido", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub(ROTAS_PADRAO);
    try {
      const res = await handleFileSecurityScanner(
        scannerRequest(uploadForm(txtFile()), {
          extraHeaders: { "content-length": String(MAX_SCAN_FILE_BYTES + 1) },
        }),
      );
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.success === true, "varredura pulada não é erro");
      assert(body.scanned === false, `scanned veio ${body.scanned}`);
      assert(body.reason === "file_too_large", `reason veio ${body.reason}`);
      assert(chamadas(stub.calls, "virustotal.com").length === 0, "provedor não podia ser chamado");
      assert(chamadas(stub.calls, "/rest/v1/audit_logs").length === 1, "auditoria tinha de registrar a varredura pulada");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: portão do upload — bordas de tamanho e arquivo ausente/vazio", () => {
  const anunciado = validateScanUpload({
    announcedLength: MAX_SCAN_FILE_BYTES + 1,
    file: txtFile(),
  });
  assert(anunciado.kind === "too_large", `anunciado acima do teto veio ${anunciado.kind}`);

  const real = validateScanUpload({ file: fakeFile(MAX_SCAN_FILE_BYTES + 1) });
  assert(real.kind === "too_large", `size real acima do teto veio ${real.kind}`);

  const vazio = validateScanUpload({ file: fakeFile(0) });
  assert(vazio.kind === "denied", `arquivo vazio veio ${vazio.kind}`);
  assert(vazio.denial?.status === 400, `vazio devia ser 400, veio ${vazio.denial?.status}`);
  assert(vazio.denial?.code === "INVALID_INPUT", `vazio devia ser INVALID_INPUT, veio ${vazio.denial?.code}`);

  const ausente = validateScanUpload({ file: null });
  assert(ausente.kind === "denied", `arquivo ausente veio ${ausente.kind}`);
  assert(ausente.denial?.status === 400, `ausente devia ser 400, veio ${ausente.denial?.status}`);

  const texto = validateScanUpload({ file: "nao-e-arquivo" });
  assert(texto.kind === "denied", `string no lugar de arquivo veio ${texto.kind}`);

  const exato = validateScanUpload({ file: fakeFile(MAX_SCAN_FILE_BYTES), announcedLength: MAX_SCAN_FILE_BYTES });
  assert(exato.kind === "ok", `exatamente no teto tinha de passar, veio ${exato.kind}`);

  const ok = validateScanUpload({ file: fakeFile(10) });
  assert(ok.kind === "ok", `arquivo pequeno veio ${ok.kind}`);
});

Deno.test("M28: hash conhecido e malicioso -> 422 SEM enviar o arquivo ao provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([...ROTAS_PADRAO, rotaRelatorio(200, { malicious: 3, suspicious: 0 })]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 422, `esperado 422, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.code === "MALWARE_DETECTED", `código veio ${body.code}`);
      assert(body.verdict === "malicious", `veredito veio ${body.verdict}`);
      assert(body.contract === "file-security-scanner", `contract veio ${body.contract}`);
      assert(typeof body.details === "object" && body.details !== null, "details tem de ser objeto");
      assert(envios(stub.calls).length === 0, "hash conhecido NÃO pode subir o arquivo ao provedor");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: hash conhecido e limpo -> 200 scanned:true SEM enviar o arquivo ao provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([...ROTAS_PADRAO, rotaRelatorio(200, { malicious: 0, suspicious: 0 })]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.success === true, `success veio ${body.success}`);
      assert(body.scanned === true, `scanned veio ${body.scanned}`);
      assert(body.verdict === "clean", `veredito veio ${body.verdict}`);
      assert(envios(stub.calls).length === 0, "hash conhecido NÃO pode subir o arquivo ao provedor");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: hash desconhecido -> envia o arquivo e aceita o veredito limpo da análise", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([
      ...ROTAS_PADRAO,
      rotaRelatorio(404),
      ROTA_SUBMIT,
      rotaAnalise("completed", { malicious: 0, suspicious: 0 }),
    ]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.verdict === "clean" && body.scanned === true, `corpo veio ${JSON.stringify(body)}`);
      assert(envios(stub.calls).length === 1, `envios do arquivo: ${envios(stub.calls).length}`);
      assert(chamadas(stub.calls, "/api/v3/analyses/").length === 1, "leitura da análise faltando");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: análise concluída maliciosa -> 422 MALWARE_DETECTED", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([
      ...ROTAS_PADRAO,
      rotaRelatorio(404),
      ROTA_SUBMIT,
      rotaAnalise("completed", { malicious: 1, suspicious: 0 }),
    ]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 422, `esperado 422, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.code === "MALWARE_DETECTED", `código veio ${body.code}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: análise concluída suspeita -> 403 SUSPICIOUS_FILE", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([
      ...ROTAS_PADRAO,
      rotaRelatorio(404),
      ROTA_SUBMIT,
      rotaAnalise("completed", { malicious: 0, suspicious: 2 }),
    ]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 403, `esperado 403, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.code === "SUSPICIOUS_FILE", `código veio ${body.code}`);
      assert(body.verdict === "suspicious", `veredito veio ${body.verdict}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: análise concluída SEM contadores -> 502 (não deu para saber não é limpo)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([...ROTAS_PADRAO, rotaRelatorio(404), ROTA_SUBMIT, rotaAnalise("completed")]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 502, `esperado 502, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.code === "SCAN_UNAVAILABLE", `código veio ${body.code}`);
      assert(body.verdict === "unknown", `veredito veio ${body.verdict}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: análise que não conclui -> 408 SCAN_TIMEOUT e o envio é bloqueado", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([...ROTAS_PADRAO, rotaRelatorio(404), ROTA_SUBMIT, rotaAnalise("queued")]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())), {
        // Sem espera real: o caminho do timeout importa, não os 20 s.
        sleep: () => Promise.resolve(),
      });
      assert(res.status === 408, `esperado 408, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.code === "SCAN_TIMEOUT", `código veio ${body.code}`);
      assert(chamadas(stub.calls, "/api/v3/analyses/").length === VT_POLL_MAX_ATTEMPTS, `consultas da análise: ${chamadas(stub.calls, "/api/v3/analyses/").length}`);
      assert(envios(stub.calls).length === 1, "o arquivo devia ter sido enviado uma vez");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: provedor inacessível na consulta por hash -> 502 SCAN_UNAVAILABLE", async () => {
  await withEnv(ENV_OK, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("/auth/v1/user")) return Promise.resolve(jsonResp({ id: "u-1" }));
      if (url.includes("resolve_network_policy")) return Promise.resolve(jsonResp({ allowed: true }));
      if (url.includes("consume_rate_limit")) return Promise.resolve(jsonResp([{ allowed: true }]));
      return Promise.reject(new TypeError("connection refused"));
    }) as typeof fetch;
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 502, `esperado 502, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.code === "SCAN_UNAVAILABLE", `código veio ${body.code}`);
    } finally {
      globalThis.fetch = original;
    }
  });
});

Deno.test("M28: provedor falha (500) no envio do arquivo -> 502 SCAN_UNAVAILABLE", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([...ROTAS_PADRAO, rotaRelatorio(404), ROTA_SUBMIT_ERRO, rotaAnalise("completed", { malicious: 0, suspicious: 0 })]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 502, `esperado 502, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.code === "SCAN_UNAVAILABLE", `código veio ${body.code}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: chave recusada só no envio (401) -> scanned:false, o envio não é bloqueado", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([...ROTAS_PADRAO, rotaRelatorio(404), ROTA_SUBMIT_NEGADO]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.scanned === false, `scanned veio ${body.scanned}`);
      assert(body.reason === "scanner_auth_failed", `reason veio ${body.reason}`);
      assert(envios(stub.calls).length === 1, "o envio foi tentado uma vez");
      assert(chamadas(stub.calls, "/api/v3/analyses/").length === 0, "sem id de análise não há polling");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: provedor recusa a chave (401) -> scanned:false, o envio não é bloqueado", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([...ROTAS_PADRAO, rotaRelatorio(401)]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.scanned === false, `scanned veio ${body.scanned}`);
      assert(body.reason === "scanner_auth_failed", `reason veio ${body.reason}`);
      assert(envios(stub.calls).length === 0, "com a chave recusada o arquivo não pode subir");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: VIRUSTOTAL_API_KEY ausente -> scanned:false e nada toca o provedor", async () => {
  await withEnv(ENV_SEM_CHAVE, async () => {
    const stub = withStub(ROTAS_PADRAO);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile())));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const body = await bodyOf(res);
      assert(body.success === true, `success veio ${body.success}`);
      assert(body.scanned === false, `scanned veio ${body.scanned}`);
      assert(body.reason === "scanner_not_configured", `reason veio ${body.reason}`);
      assert(chamadas(stub.calls, "virustotal.com").length === 0, "sem chave não se chama o provedor");
      assert(chamadas(stub.calls, "/rest/v1/audit_logs").length === 1, "auditoria tinha de registrar a varredura pulada");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: auditoria registra veredito/hash/tamanho e NÃO carrega o nome do arquivo", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withStub([...ROTAS_PADRAO, rotaRelatorio(200, { malicious: 0, suspicious: 0 })]);
    try {
      const res = await handleFileSecurityScanner(scannerRequest(uploadForm(txtFile("nome-interno.pdf"))));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);

      const audit = chamadas(stub.calls, "/rest/v1/audit_logs");
      assert(audit.length === 1, `linhas de auditoria: ${audit.length}`);
      const linha = audit[0] as Call & { body?: unknown };
      assert(linha.body !== undefined, "a auditoria precisa do corpo do insert");
      const texto = JSON.stringify(linha.body);
      assert(texto.includes("file_security_scan"), `ação não registrada: ${texto}`);
      assert(!texto.includes("nome-interno.pdf"), `a auditoria carregou o nome do arquivo: ${texto}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("M28: SHA-256 em hex minúsculo (chave de consulta do provedor)", async () => {
  // `printf 'conteudo' | sha256sum` -> 92359bb2...
  const digest = await sha256Hex(new TextEncoder().encode("conteudo").buffer as ArrayBuffer);
  assert(
    digest === "92359bb294288000958de4f1f20d5778681b14bfe2f0868104f79230942a6984",
    `sha256 veio ${digest}`,
  );
});

Deno.test("M28: contadores e veredito — sem contadores não há veredito", () => {
  assert(readScanStats({ stats: { malicious: 1, suspicious: 0 } })?.malicious === 1, "stats válidos não lidos");
  assert(readScanStats({}) === null, "stats ausentes tinham de ser null");
  assert(readScanStats({ stats: { suspicious: 0 } }) === null, "malicious ausente tinha de ser null");
  assert(readScanStats({ stats: { malicious: "1", suspicious: 0 } }) === null, "tipo errado tinha de ser null");
  assert(readScanStats(null) === null, "atributos nulos tinham de ser null");

  assert(verdictFromStats({ malicious: 2, suspicious: 0 }) === "malicious", "malicious não reconhecido");
  assert(verdictFromStats({ malicious: 0, suspicious: 1 }) === "suspicious", "suspicious não reconhecido");
  assert(verdictFromStats({ malicious: 0, suspicious: 0 }) === "clean", "clean não reconhecido");
  assert(VT_POLL_MAX_ATTEMPTS > 0, "o polling precisa de pelo menos uma tentativa");
});

Deno.test("M28 [refazer 1]: um único motor malicioso já bloqueia (fronteira fail-closed)", () => {
  assert(
    verdictFromStats({ malicious: 1, suspicious: 0 }) === "malicious",
    "1 motor malicioso tinha de ser malicious, não clean",
  );
});
