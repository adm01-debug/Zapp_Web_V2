#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_SECRET_ALLOWLIST = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
]);

export function hasPullRequestTrigger(source) {
  const lines = source.split(/\r?\n/u);
  const onIndex = lines.findIndex((line) => /^on:\s*(?:#.*)?$/u.test(line));

  if (onIndex === -1) {
    return /^on:\s*\[[^\]]*\bpull_request(?:_target)?\b[^\]]*\]/mu.test(source);
  }

  for (let index = onIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z_-][A-Za-z0-9_-]*:\s*/u.test(line)) break;
    if (/^\s{2}pull_request(?:_target)?:/u.test(line)) return true;
  }

  return false;
}

export function findPullRequestSecretLeaks(source, file = 'workflow.yml') {
  if (!hasPullRequestTrigger(source)) return [];

  const violations = [];
  const expressionPattern = /\$\{\{([\s\S]*?)\}\}/gu;
  for (const match of source.matchAll(expressionPattern)) {
    const expression = match[1];
    if (!/\bsecrets\b/u.test(expression)) continue;

    const expressionIndex = match.index ?? 0;
    const lineNumber = source.slice(0, expressionIndex).split(/\r?\n/u).length;
    const lineStart = source.lastIndexOf('\n', expressionIndex) + 1;
    const rawLine = source.slice(lineStart, source.indexOf('\n', expressionIndex) === -1
      ? source.length
      : source.indexOf('\n', expressionIndex));
    if (rawLine.trimStart().startsWith('#')) continue;

    const names = [...expression.matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/gu)]
      .map((match) => match[1]);
    const hasDynamicAccess = /\bsecrets\s*\[/u.test(expression);
    const hasWholeContextAccess = names.length === 0 && !hasDynamicAccess;

    for (const name of names) {
      if (!PUBLIC_SECRET_ALLOWLIST.has(name)) {
        violations.push({ file, line: lineNumber, secret: name });
      }
    }

    if (hasDynamicAccess || hasWholeContextAccess) {
      violations.push({
        file,
        line: lineNumber,
        secret: hasDynamicAccess ? 'dynamic secrets[...] access' : 'whole secrets context',
      });
    }
  }

  return violations;
}

export function scanWorkflowDirectory(workflowsDirectory) {
  return readdirSync(workflowsDirectory)
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort()
    .flatMap((file) => findPullRequestSecretLeaks(
      readFileSync(path.join(workflowsDirectory, file), 'utf8'),
      file,
    ));
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const workflowsDirectory = path.join(root, '.github', 'workflows');
  const violations = scanWorkflowDirectory(workflowsDirectory);

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(
        `ERRO: ${violation.file}:${violation.line} referencia ${violation.secret} em workflow de PR.`,
      );
    }
    console.error('Mova operações privilegiadas para workflow confiável sem pull_request.');
    process.exitCode = 1;
    return;
  }

  console.log('OK: workflows de PR nao recebem secrets privilegiados.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
