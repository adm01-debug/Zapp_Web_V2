#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
import { loadRealtimeBaseline } from './check-runtime-config.mjs';

function unwrap(node) {
  let current = node;
  while (current && (ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isSatisfiesExpression(current))) {
    current = current.expression;
  }
  return current;
}

function literalText(node) {
  const value = unwrap(node);
  return value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
    ? value.text
    : null;
}

function objectProperty(object, name) {
  const value = unwrap(object);
  if (!value || !ts.isObjectLiteralExpression(value)) return null;
  const property = value.properties.find(candidate => {
    if (!ts.isPropertyAssignment(candidate)) return false;
    const key = candidate.name;
    return (ts.isIdentifier(key) || ts.isStringLiteral(key)) && key.text === name;
  });
  return property && ts.isPropertyAssignment(property) ? property.initializer : null;
}

export function extractRealtimeSubscriptions(source, fileName = 'fixture.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const subscriptions = [];
  const unresolved = [];

  function record(config, node, kind) {
    const table = literalText(objectProperty(config, 'table'));
    const schema = literalText(objectProperty(config, 'schema')) || 'public';
    if (!table) {
      // This single wrapper receives its table from useSupabaseRealtime callers,
      // which are inspected separately below. Dynamic direct channels elsewhere
      // remain fail-closed.
      if (kind === 'channel.on' && /(?:^|[/\\])useSupabaseRealtime\.ts$/.test(fileName)) return;
      unresolved.push({ file: fileName, line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind });
      return;
    }
    subscriptions.push(`${schema}.${table}`);
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (ts.isPropertyAccessExpression(callee)
        && callee.name.text === 'on'
        && literalText(node.arguments[0]) === 'postgres_changes') {
        record(node.arguments[1], node, 'channel.on');
      } else if (ts.isIdentifier(callee) && callee.text === 'useSupabaseRealtime') {
        record(node.arguments[0], node, 'useSupabaseRealtime');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { subscriptions, unresolved };
}

function sourceFiles(root) {
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') visit(fullPath);
      } else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  };
  visit(root);
  return files.sort();
}

export function evaluateRealtimeSubscriptions(root = 'src', baseline = loadRealtimeBaseline()) {
  const subscriptions = [];
  const unresolved = [];
  for (const file of sourceFiles(root)) {
    const result = extractRealtimeSubscriptions(fs.readFileSync(file, 'utf8'), file);
    subscriptions.push(...result.subscriptions);
    unresolved.push(...result.unresolved);
  }
  const uniqueSubscriptions = [...new Set(subscriptions)].sort();
  const allowed = new Set(baseline);
  const absentFromPublication = uniqueSubscriptions.filter(table => !allowed.has(table));
  return { subscriptions: uniqueSubscriptions, unresolved, absentFromPublication };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = evaluateRealtimeSubscriptions();
    if (result.unresolved.length || result.absentFromPublication.length) {
      console.error(`Realtime subscription guard failed: unresolved=${result.unresolved.length}; absent=${result.absentFromPublication.join(',') || 'none'}`);
      process.exitCode = 1;
    } else {
      console.log(`Realtime subscription guard: ${result.subscriptions.length} subscribed tables are present in the canonical baseline.`);
    }
  } catch {
    console.error('Realtime subscription guard failed; sensitive diagnostics omitted.');
    process.exitCode = 1;
  }
}
