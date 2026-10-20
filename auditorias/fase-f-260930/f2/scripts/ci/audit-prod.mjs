#!/usr/bin/env node
// Bloqueia o CI quando `bun audit` reporta advisory HIGH/CRITICAL alcancavel a
// partir de uma dependencia de PRODUCAO (package.json#dependencies). Advisories
// cujas cadeias comecam so em devDependencies (vite, vitest, eslint, babel...)
// seguem informativas: nao chegam ao bundle nem as edges.
//
// `bun audit` nao tem --prod e o --json devolve o bulk de advisories sem filtrar
// pela versao instalada; por isso o parse e feito na saida de texto, que ja vem
// filtrada e traz a cadeia de dependencia de cada ocorrencia:
//
//   picomatch  <2.3.2
//     vite › tinyglobby › fdir › picomatch
//     high: Picomatch has a ReDoS ... - https://github.com/advisories/GHSA-...
//
// Uso: node scripts/ci/audit-prod.mjs [--level high|critical] [--input arquivo]

import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SEVERITIES = ["low", "moderate", "high", "critical"];

export function parseAuditText(text) {
  const findings = [];
  let current = null;
  for (const rawLine of String(text ?? "").replace(/\r\n?/gu, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (!/^\s/u.test(line)) {
      // Cabecalho de pacote: "nome  faixa". Ignora o rodape "N vulnerabilities (...)".
      const match = line.match(/^(@?[a-z][^\s]*)\s+(.+)$/u);
      if (!match) continue;
      current = { package: match[1], range: match[2], chains: [], advisories: [] };
      findings.push(current);
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    const severity = trimmed.match(/^(low|moderate|high|critical):\s*(.*)$/u);
    if (severity) {
      current.advisories.push({ severity: severity[1], title: severity[2] });
      continue;
    }
    const chain = trimmed.split("›").map((part) => part.trim()).filter(Boolean);
    if (chain.length) current.chains.push(chain);
  }
  return findings;
}

export function evaluate(findings, prodDeps, minLevel = "high") {
  const threshold = SEVERITIES.indexOf(minLevel);
  const prod = new Set(prodDeps);
  const blocking = [];
  for (const finding of findings) {
    const worst = Math.max(-1, ...finding.advisories.map((a) => SEVERITIES.indexOf(a.severity)));
    if (worst < threshold) continue;
    // Cadeia de um unico elemento = a propria dependencia direta.
    const prodChains = finding.chains.filter((chain) => prod.has(chain[0]));
    if (prodChains.length === 0) continue;
    blocking.push({
      package: finding.package,
      range: finding.range,
      severity: SEVERITIES[worst],
      chains: prodChains.map((chain) => chain.join(" › ")),
      advisories: finding.advisories.filter((a) => SEVERITIES.indexOf(a.severity) >= threshold).map((a) => a.title),
    });
  }
  return blocking;
}

function parseArgs(argv) {
  const args = { level: "high", input: null, packageJson: "package.json" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--level") args.level = argv[++index];
    else if (argv[index] === "--input") args.input = argv[++index];
    else if (argv[index] === "--package-json") args.packageJson = argv[++index];
    else throw new Error(`Argumento desconhecido: ${argv[index]}`);
  }
  if (!SEVERITIES.includes(args.level)) throw new Error(`--level invalido: ${args.level}`);
  return args;
}

export function main(argv = process.argv.slice(2), root = process.cwd()) {
  const args = parseArgs(argv);
  const pkg = JSON.parse(readFileSync(path.resolve(root, args.packageJson), "utf8"));
  const prodDeps = Object.keys(pkg.dependencies ?? {});

  let text;
  if (args.input) {
    text = readFileSync(path.resolve(root, args.input), "utf8");
  } else {
    const run = spawnSync("bun", ["audit", "--audit-level=low"], { cwd: root, encoding: "utf8" });
    if (run.error || run.signal) {
      console.error(`ERRO: nao foi possivel executar bun audit: ${run.error?.message ?? `sinal ${run.signal}`}`);
      return 2;
    }
    text = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  }

  // bun audit sai com 1 tanto para advisory quanto para falha de registry: o que
  // distingue e o relatorio. Sem a linha de resumo ("N vulnerabilities" / "No
  // vulnerabilities found") a saida nao e um audit e o gate falha fechado.
  if (!/\bvulnerabilit(y|ies)\b/i.test(text)) {
    console.error("ERRO: saida do bun audit nao reconhecida como relatorio (falha operacional?):");
    console.error(text.trim().slice(0, 2000) || "(vazia)");
    return 2;
  }

  const findings = parseAuditText(text);
  const blocking = evaluate(findings, prodDeps, args.level);
  const total = findings.length;
  console.log(`bun audit: ${total} pacote(s) com advisory; ${prodDeps.length} dependencias de producao consideradas.`);
  if (blocking.length === 0) {
    console.log(`OK: nenhuma advisory >= ${args.level} alcancavel por dependencia de producao.`);
    return 0;
  }
  console.error(`\nFALHA: ${blocking.length} pacote(s) com advisory >= ${args.level} em dependencia de producao:`);
  for (const item of blocking) {
    console.error(`  ${item.package} ${item.range} [${item.severity}]`);
    for (const chain of item.chains) console.error(`    via ${chain}`);
    for (const advisory of item.advisories) console.error(`    - ${advisory}`);
  }
  console.error("Atualize a dependencia (bun update <pacote>) ou registre a excecao com justificativa no PR.");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main());
}
