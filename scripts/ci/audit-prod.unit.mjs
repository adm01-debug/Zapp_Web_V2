import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { evaluate, main, parseAuditText } from "./audit-prod.mjs";

const sample = [
  "picomatch  <2.3.2",
  "  vite › tinyglobby › fdir › picomatch",
  "  tailwindcss › fast-glob › micromatch › picomatch",
  "  high: Picomatch has a ReDoS vulnerability via extglob quantifiers - https://github.com/advisories/GHSA-c2c7-rcm5-vvqj",
  "",
  "@remix-run/router  <=1.23.1",
  "  react-router-dom › react-router › @remix-run/router",
  "  high: React Router allows XSS via open redirects - https://github.com/advisories/GHSA-2w69-qvjg-hvjx",
  "",
  "dompurify  <3.2.4",
  "  dompurify",
  "  moderate: DOMPurify allows Cross-site Scripting (XSS) - https://github.com/advisories/GHSA-vhxf-7vqr-mrjg",
  "",
  "3 vulnerabilities (2 high, 1 moderate)",
].join("\n");

// Saida real do bun 1.4.0 (o CI pina `bun-version: '1.4.0'`), capturada com a
// versao instalada no WSL. O formato do bun e' `pacote@versao` + cadeia com
// ` > ` e a linha final de resumo com as contagens por severidade.
const realBun = [
  "bun audit v1.4.0 (34cbb9a40)",
  "",
  "brace-expansion@1.1.18, 5.0.12",
  "  eslint > @eslint/eslintrc > minimatch > brace-expansion",
  "  high: brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion (<1.1.19) - https://github.com/advisories/GHSA-6j4f-fj2g-mc7p",
  "  moderate: brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service (<1.1.21) - https://github.com/advisories/GHSA-q2hr-2g5m-vwhr",
  "",
  "dompurify@3.4.16, 3.4.14, 3.4.13",
  "  (direct dependency)",
  "  low: DOMPurify: IN_PLACE: node-removing afterSanitize hook leaves detached subtree event handlers armed, causing DOM XSS (>=3.4.13 <=3.4.15) - https://github.com/advisories/GHSA-p98j-92pf-mc4p",
  "",
  "3 vulnerabilities (1 high, 1 moderate, 1 low)",
  "",
  "  bun audit fix           upgrade the vulnerable packages within their ranges",
  "  bun audit fix --latest  also cross major versions",
].join("\n");

test("parse agrupa pacote, cadeias e advisories", () => {
  const findings = parseAuditText(sample);
  assert.equal(findings.length, 3);
  assert.deepEqual(findings[0].chains, [
    ["vite", "tinyglobby", "fdir", "picomatch"],
    ["tailwindcss", "fast-glob", "micromatch", "picomatch"],
  ]);
  assert.equal(findings[0].advisories[0].severity, "high");
  assert.deepEqual(findings[2].chains, [["dompurify"]]);
});

test("bloqueia so cadeias que comecam em dependencia de producao", () => {
  const findings = parseAuditText(sample);
  const prod = ["react-router-dom", "dompurify"];
  const blocking = evaluate(findings, prod, "high");
  assert.deepEqual(blocking.map((b) => b.package), ["@remix-run/router"]);
  assert.deepEqual(blocking[0].chains, ["react-router-dom › react-router › @remix-run/router"]);
  // moderate so bloqueia se o nivel for moderate
  assert.deepEqual(evaluate(findings, prod, "moderate").map((b) => b.package), ["@remix-run/router", "dompurify"]);
  // Se vite fosse dependencia de producao, picomatch bloquearia — main() filtra
  // devDependencies antes de chamar evaluate, por isso no repo real ele nunca bloqueia.
  assert.deepEqual(evaluate(findings, ["vite"], "high").map((b) => b.package), ["picomatch"]);
});

test("main le --input e falha/passa conforme package.json", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-prod-"));
  writeFileSync(path.join(dir, "audit.txt"), sample);
  writeFileSync(path.join(dir, "prod.json"), JSON.stringify({ dependencies: { "react-router-dom": "^6" }, devDependencies: { vite: "^8" } }));
  writeFileSync(path.join(dir, "dev.json"), JSON.stringify({ dependencies: { react: "^19" }, devDependencies: { vite: "^8", "react-router-dom": "^6" } }));
  assert.equal(main(["--input", "audit.txt", "--package-json", "prod.json"], dir), 1);
  assert.equal(main(["--input", "audit.txt", "--package-json", "dev.json"], dir), 0);
});

test("main falha fechado quando a saida nao e um relatorio e passa com 'No vulnerabilities found'", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-prod-"));
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    writeFileSync(path.join(dir, "broken.txt"), "error: failed to fetch https://registry.npmjs.org/-/npm/v1/security/advisories/bulk\n");
    writeFileSync(path.join(dir, "clean.txt"), "No vulnerabilities found\n");
    assert.equal(main(["--level", "high", "--input", "broken.txt"], dir), 2);
    assert.equal(main(["--level", "high", "--input", "clean.txt"], dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// R2-INF-009: o reconhecimento do relatorio nao pode aceitar qualquer texto que
// fale em "vulnerability" — a falha operacional do registry virava exit 0.
test("main falha fechado para erro operacional mesmo contendo a palavra vulnerability", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-prod-"));
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    // Prova sintetica da reauditoria (probe invalid_audit_report_passes).
    writeFileSync(path.join(dir, "erro-db.txt"), "error: Could not retrieve the vulnerability database.\n");
    // Erro real do bun 1.4.0 com registry inalcancavel.
    writeFileSync(
      path.join(dir, "erro-registry.txt"),
      "bun audit v1.4.0 (34cbb9a40)\n\nerror: POST https://127.0.0.1:1/-/npm/v1/security/advisories/bulk - ConnectionRefused\n",
    );
    assert.equal(main(["--level", "high", "--input", "erro-db.txt"], dir), 2);
    assert.equal(main(["--level", "high", "--input", "erro-registry.txt"], dir), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// R2-INF-009: relatorio parcial (advisory sumido) ou resumo que nao fecha com as
// contagens nao e relatorio completo.
test("main falha fechado para relatorio parcial ou com contagem inconsistente", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-prod-"));
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    writeFileSync(
      path.join(dir, "parcial.txt"),
      ["react-router-dom@6.0.0", "  high: XSS via open redirects - https://github.com/advisories/GHSA-1", "", "3 vulnerabilities (2 high, 1 moderate)"].join("\n"),
    );
    writeFileSync(
      path.join(dir, "sem-resumo.txt"),
      ["react-router-dom@6.0.0", "  high: XSS via open redirects - https://github.com/advisories/GHSA-1"].join("\n"),
    );
    writeFileSync(
      path.join(dir, "soma-errada.txt"),
      ["react-router-dom@6.0.0", "  high: XSS via open redirects - https://github.com/advisories/GHSA-1", "", "5 vulnerabilities (2 high, 1 moderate)"].join("\n"),
    );
    assert.equal(main(["--level", "high", "--input", "parcial.txt"], dir), 2);
    assert.equal(main(["--level", "high", "--input", "sem-resumo.txt"], dir), 2);
    assert.equal(main(["--level", "high", "--input", "soma-errada.txt"], dir), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// R2-INF-009: o CI neutraliza o `|| true` do passo do coletor; o status preservado
// chega pelo --status e crash/abort nao pode passar como verde.
test("main consome o status do coletor preservado pelo CI", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-prod-"));
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    writeFileSync(path.join(dir, "limpo.txt"), "No vulnerabilities found (checked 812 packages)\n");
    writeFileSync(path.join(dir, "status-0.txt"), "0\n");
    writeFileSync(path.join(dir, "status-1.txt"), "1\n");
    writeFileSync(path.join(dir, "status-crash.txt"), "139\n");
    writeFileSync(path.join(dir, "status-lixo.txt"), "nao-numero\n");
    assert.equal(main(["--level", "high", "--input", "limpo.txt", "--status", "status-0.txt"], dir), 0);
    assert.equal(main(["--level", "high", "--input", "limpo.txt", "--status", "status-1.txt"], dir), 0);
    assert.equal(main(["--level", "high", "--input", "limpo.txt", "--status", "status-crash.txt"], dir), 2);
    assert.equal(main(["--level", "high", "--input", "limpo.txt", "--status", "status-lixo.txt"], dir), 2);
    assert.equal(main(["--level", "high", "--input", "limpo.txt", "--status", "status-ausente.txt"], dir), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main aceita o relatorio real do bun 1.4.0 quando as contagens fecham", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-prod-"));
  try {
    writeFileSync(path.join(dir, "real.txt"), realBun);
    writeFileSync(path.join(dir, "prod.json"), JSON.stringify({ dependencies: { dompurify: "^3" }, devDependencies: { eslint: "^9" } }));
    // dompurify e' dependencia de producao, mas o advisory real e' `low`: com
    // --level high o gate nao bloqueia — o que importa aqui e' o relatorio ser
    // reconhecido (sem ele o exit seria 2).
    assert.equal(main(["--level", "high", "--input", "real.txt", "--package-json", "prod.json"], dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// refazer 1 (R2-INF-009): um cabecalho de pacote que comeca por `error-` e dado
// valido do relatorio. A regex anterior `/^error\b/` casava tambem antes do
// hifen (`\b` entre `r` e `-`), entao `error-ex@1.2.3` era classificado como
// erro operacional e derrubava o gate com exit 2 num relatorio completo.
test("main aceita relatorio completo com pacote error-ex (nao confunde cabecalho com erro operacional)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-prod-"));
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { "react-dev-utils": "^12" } }));
    writeFileSync(
      path.join(dir, "error-ex.txt"),
      [
        "bun audit v1.4.0 (34cbb9a40)",
        "",
        "error-ex@1.2.3, 1.2.4",
        "  react-dev-utils > error-ex",
        "  moderate: error-ex: prototype pollution - https://github.com/advisories/GHSA-1",
        "",
        "1 vulnerability (1 moderate)",
      ].join("\n"),
    );
    // O advisory e' `moderate`: com --level high nao bloqueia, mas o relatorio
    // tem de ser reconhecido — com o falso positivo o exit seria 2.
    assert.equal(main(["--level", "high", "--input", "error-ex.txt"], dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
