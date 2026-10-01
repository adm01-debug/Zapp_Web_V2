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

export function hasPushTriggerUnrestricted(source) {
  // Scalar: on: push (single event, no branch restriction)
  if (/^on:\s*push\s*(?:#.*)?$/mu.test(source)) return true;

  // Inline array: on: [push] or on: [push, pull_request] etc.
  if (/^on:\s*\[[^\]]*\bpush\b[^\]]*\]/mu.test(source)) return true;

  const lines = source.replace(/\r\n?/gu, '\n').split('\n');
  const onIndex = lines.findIndex((l) => /^on:\s*(?:#.*)?$/u.test(l));
  if (onIndex === -1) return false;

  let pushStart = -1;
  let pushIndent = 0;
  let pushEnd = lines.length;

  for (let i = onIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Top-level key ends the 'on:' block
    if (/^[^\s#]/.test(line)) { pushEnd = i; break; }
    // Detect: push: (empty line) or push: {} (inline empty mapping)
    const pushMatch = /^(\s+)push:\s*(?:\{\})?\s*(?:#.*)?$/.exec(line);
    if (pushMatch) { pushStart = i; pushIndent = pushMatch[1].length; continue; }
    // Inside push block: detect sibling key at same or lesser indent = end of push
    if (pushStart !== -1) {
      const indentMatch = /^(\s+)\S/.exec(line);
      if (indentMatch && indentMatch[1].length <= pushIndent && !/^\s*#/.test(line)) {
        pushEnd = i; break;
      }
    }
  }

  if (pushStart === -1) return false;

  // Restricted to main only = branches: [main] (or quoted), without any tags: filter.
  // A tags: filter alongside branches: [main] means tag pushes bypass the branch restriction.
  for (let i = pushStart + 1; i < pushEnd; i++) {
    if (
      /^\s+branches:\s*\[\s*(?:"main"|'main'|main)\s*\]\s*(?:#.*)?$/.test(lines[i]) &&
      !lines.slice(pushStart + 1, pushEnd).some((line) => /^\s+tags(?:-ignore)?:/.test(line))
    ) {
      return false;
    }
  }

  return true;
}

function _findSecretRefs(source, file) {
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
      .map((m) => m[1]);
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

export function findPullRequestSecretLeaks(source, file = 'workflow.yml') {
  if (!hasPullRequestTrigger(source)) return [];
  return _findSecretRefs(source, file);
}

export function findPushSecretLeaks(source, file = 'workflow.yml') {
  if (!hasPushTriggerUnrestricted(source)) return [];
  return _findSecretRefs(source, file);
}

export function scanWorkflowDirectory(workflowsDirectory) {
  const seen = new Set();
  return readdirSync(workflowsDirectory)
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort()
    .flatMap((file) => {
      const source = readFileSync(path.join(workflowsDirectory, file), 'utf8');
      const violations = [
        ...findPullRequestSecretLeaks(source, file),
        ...findPushSecretLeaks(source, file),
      ];
      return violations.filter((v) => {
        const key = `${v.file}:${v.line}:${v.secret}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const workflowsDirectory = path.join(root, '.github', 'workflows');
  const violations = scanWorkflowDirectory(workflowsDirectory);

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(
        `ERRO: ${violation.file}:${violation.line} referencia ${violation.secret} em workflow de PR ou push irrestrito.`,
      );
    }
    console.error('Mova operações privilegiadas para workflow confiável sem pull_request ou restrinja push a [main].');
    process.exitCode = 1;
    return;
  }

  console.log('OK: workflows de PR e push irrestrito nao recebem secrets privilegiados.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
