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
  if (!value || !ts.isObjectLiteralExpression(value)) return { kind: 'dynamic' };
  // A spread can overwrite a property that appears before it, or introduce a
  // property the guard cannot inspect. Treat the whole config as unresolved;
  // approving the first textual property would be a false proof.
  if (value.properties.some(ts.isSpreadAssignment)) return { kind: 'dynamic' };
  const properties = value.properties.filter(candidate => {
    const key = candidate.name;
    return key && (ts.isIdentifier(key) || ts.isStringLiteral(key)) && key.text === name;
  });
  if (properties.length === 0) return { kind: 'absent' };
  if (properties.length !== 1 || !ts.isPropertyAssignment(properties[0])) return { kind: 'dynamic' };
  return { kind: 'present', value: properties[0].initializer };
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
  const constantStrings = new Map();
  const wrapperIdentifiers = new Set();
  const wrapperNamespaces = new Set();
  const wrapperAliases = new Map();
  const boundOnIdentifiers = new Set();
  const localDeclarations = new Set();

  function isRealtimeWrapperModule(value) {
    return typeof value === 'string'
      && (value.includes('/realtime') || value.endsWith('useSupabaseRealtime'));
  }

  function collectBindings(node) {
    if (ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.name) localDeclarations.add(clause.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) localDeclarations.add(element.name.text);
      } else if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        localDeclarations.add(clause.namedBindings.name.text);
      }
      if (!isRealtimeWrapperModule(node.moduleSpecifier.text)) {
        ts.forEachChild(node, collectBindings);
        return;
      }
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          const imported = element.propertyName?.text || element.name.text;
          if (imported === 'useSupabaseRealtime') wrapperIdentifiers.add(element.name.text);
        }
      } else if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        wrapperNamespaces.add(clause.namedBindings.name.text);
      }
    }

    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      localDeclarations.add(node.name.text);
    }

    if (ts.isVariableStatement(node)
      && (node.declarationList.flags & ts.NodeFlags.Const) !== 0) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        localDeclarations.add(declaration.name.text);
        const initializer = unwrap(declaration.initializer);
        const text = literalText(initializer);
        if (text !== null) constantStrings.set(declaration.name.text, text);
        if (ts.isIdentifier(initializer)) wrapperAliases.set(declaration.name.text, initializer.text);
        if (boundOnTarget(initializer)) boundOnIdentifiers.add(declaration.name.text);
      }
    }
    ts.forEachChild(node, collectBindings);
  }
  collectBindings(sourceFile);

  function resolvedLiteral(node) {
    const direct = literalText(node);
    if (direct !== null) return direct;
    const value = unwrap(node);
    return value && ts.isIdentifier(value) ? constantStrings.get(value.text) ?? null : null;
  }

  function isKnownWrapperIdentifier(name, seen = new Set()) {
    if (wrapperIdentifiers.has(name)) return true;
    if (name === 'useSupabaseRealtime' && !localDeclarations.has(name)) return true;
    if (seen.has(name)) return false;
    seen.add(name);
    const target = wrapperAliases.get(name);
    return target ? isKnownWrapperIdentifier(target, seen) : false;
  }

  function isKnownWrapperCallee(callee) {
    if (ts.isIdentifier(callee)) return isKnownWrapperIdentifier(callee.text);
    return ts.isPropertyAccessExpression(callee)
      && callee.name.text === 'useSupabaseRealtime'
      && ts.isIdentifier(unwrap(callee.expression))
      && wrapperNamespaces.has(unwrap(callee.expression).text);
  }

  function propertyName(node) {
    const value = unwrap(node);
    if (ts.isPropertyAccessExpression(value)) return value.name.text;
    if (ts.isElementAccessExpression(value) && value.argumentExpression) {
      return literalText(value.argumentExpression);
    }
    return null;
  }

  function boundOnTarget(callee) {
    const value = unwrap(callee);
    if (!ts.isCallExpression(value)) return null;
    const bind = unwrap(value.expression);
    if (!ts.isPropertyAccessExpression(bind) || bind.name.text !== 'bind') return null;
    return propertyName(bind.expression) === 'on' ? bind.expression : null;
  }

  function record(config, node, kind) {
    const tableProperty = objectProperty(config, 'table');
    const schemaProperty = objectProperty(config, 'schema');
    const table = tableProperty.kind === 'present' ? resolvedLiteral(tableProperty.value) : null;
    const schema = schemaProperty.kind === 'absent'
      ? 'public'
      : schemaProperty.kind === 'present'
        ? resolvedLiteral(schemaProperty.value)
        : null;
    if (!table || !schema) {
      // This single wrapper receives its table from useSupabaseRealtime callers,
      // which are inspected separately below. Dynamic direct channels elsewhere
      // remain fail-closed.
      const normalizedFile = fileName.replaceAll('\\', '/');
      if (kind === 'channel.on'
        && (normalizedFile === 'src/hooks/realtime/useSupabaseRealtime.ts'
          || normalizedFile.endsWith('/src/hooks/realtime/useSupabaseRealtime.ts'))) return;
      unresolved.push({ file: fileName, line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind });
      return;
    }
    subscriptions.push(`${schema}.${table}`);
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const onTarget = propertyName(callee) === 'on'
        ? callee
        : boundOnTarget(callee) || (ts.isIdentifier(callee) && boundOnIdentifiers.has(callee.text) ? callee : null);
      if (onTarget) {
        const event = resolvedLiteral(node.arguments[0]);
        if (event === 'postgres_changes') {
          record(node.arguments[1], node, 'channel.on');
        } else if (event === null) {
          unresolved.push({
            file: fileName,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            kind: 'channel.on.event',
          });
        }
      } else if (isKnownWrapperCallee(callee)) {
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
