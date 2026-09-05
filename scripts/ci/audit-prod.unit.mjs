import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
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
