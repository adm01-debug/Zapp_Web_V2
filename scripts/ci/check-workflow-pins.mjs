#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]+)?@[a-f0-9]{40}$/u;

export function findMutableActionRefs(source, file = "workflow.yml") {
  const violations = [];
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#.*)?$/u);
    if (!match) continue;

    const reference = match[1].replace(/^['"]|['"]$/gu, "");
    if (reference.startsWith("./") || reference.startsWith("docker://")) continue;
    if (!FULL_SHA.test(reference)) {
      violations.push({ file, line: index + 1, reference });
    }
  }

  return violations;
}

export function main(root = process.cwd()) {
  const workflowsDir = path.join(root, ".github", "workflows");
  const files = readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort();
  const violations = files.flatMap((file) =>
    findMutableActionRefs(readFileSync(path.join(workflowsDir, file), "utf8"), file),
  );

  if (violations.length) {
    console.error("FALHA: GitHub Actions com referência mutável:");
    for (const violation of violations) {
      console.error(`  ${violation.file}:${violation.line} ${violation.reference}`);
    }
    console.error("Use o SHA completo de 40 caracteres e mantenha a versão em comentário.");
    return 1;
  }

  console.log(`OK: ${files.length} workflows usam somente Actions fixadas por SHA.`);
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
