#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]+)?@[a-f0-9]{40}$/u;

export function findMutableActionRefs(source, file = "workflow.yml") {
  const violations = [];
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*(?:-\s*)?(?:uses|["']uses["'])\s*:\s*(.*)$/u);
    if (!match) continue;
    const rawValue = match[1].trim();
    const blockScalar = /^[>|][+-]?(?:\s+#.*)?$/u.test(rawValue);
    if (blockScalar) { violations.push({ file, line: index+1, reference: "<unsupported-or-multiline-value>" }); continue; }
    const scalar = rawValue.match(/^(?:'([^']*)'|"([^"]*)"|([^\s#'"]+))(?:\s+#.*)?$/u);
    if (!scalar) { violations.push({ file, line: index+1, reference: rawValue ? "<unsupported-or-multiline-value>" : "<missing-or-multiline-value>" }); continue; }
    const reference = scalar[1] ?? scalar[2] ?? scalar[3];
    if (reference.startsWith("./") || reference.startsWith("docker://")) continue;
    if (!FULL_SHA.test(reference)) { violations.push({ file, line: index+1, reference }); }
  }
  return violations;
}

export function findUnauthorizedActionOwners(source, file = "workflow.yml", allowedOwnerRepos) {
  const violations = [];
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*(?:-\s*)?(?:uses|["']uses["'])\s*:\s*(.*)$/u);
    if (!match) continue;
    const rawValue = match[1].trim();
    const scalar = rawValue.match(/^(?:'([^']*)'|"([^"]*)"|([^\s#'"]+))(?:\s+#.*)?$/u);
    if (!scalar) continue;
    const reference = scalar[1] ?? scalar[2] ?? scalar[3];
    if (reference.startsWith("./") || reference.startsWith("docker://")) continue;
    const withoutPin = reference.split("@")[0];
    const segments = withoutPin.split("/");
    if (segments.length < 2) continue;
    const ownerRepo = `${segments[0]}/${segments[1]}`;
    if (!allowedOwnerRepos.has(ownerRepo)) {
      violations.push({ file, line: index + 1, reference, ownerRepo });
    }
  }
  return violations;
}

export function loadAllowedOwnerRepos(root = process.cwd()) {
  const jsonPath = path.join(root, "scripts", "ci", "allowed-actions.json");
  const data = JSON.parse(readFileSync(jsonPath, "utf8"));
  return new Set(data.patterns);
}

export function main(root = process.cwd()) {
  const workflowsDir = path.join(root, ".github", "workflows");
  const files = readdirSync(workflowsDir).filter((file) => /\.ya?ml$/u.test(file)).sort();

  const pinViolations = files.flatMap((file) =>
    findMutableActionRefs(readFileSync(path.join(workflowsDir, file), "utf8"), file),
  );

  const allowedOwnerRepos = loadAllowedOwnerRepos(root);
  const ownerViolations = files.flatMap((file) =>
    findUnauthorizedActionOwners(readFileSync(path.join(workflowsDir, file), "utf8"), file, allowedOwnerRepos),
  );

  let exitCode = 0;

  if (pinViolations.length) {
    console.error("FALHA: GitHub Actions com referência mutável:");
    for (const violation of pinViolations) { console.error(`  ${violation.file}:${violation.line} ${violation.reference}`); }
    console.error("Use o SHA completo de 40 caracteres e mantenha a versão em comentário.");
    exitCode = 1;
  }

  if (ownerViolations.length) {
    console.error("FALHA: GitHub Actions de repositório não autorizado:");
    for (const violation of ownerViolations) { console.error(`  ${violation.file}:${violation.line} ${violation.ownerRepo} (${violation.reference})`); }
    console.error("Adicione o owner/repo em scripts/ci/allowed-actions.json se for legítimo.");
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log(`OK: ${files.length} workflows usam somente Actions fixadas por SHA e de repositórios autorizados.`);
  }

  return exitCode;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
