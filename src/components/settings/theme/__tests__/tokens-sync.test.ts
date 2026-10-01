import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CSS_VARS_TO_APPLY, getPresetById } from '../presets';

const cssPath = path.resolve(__dirname, '../../../../styles/tokens.css');
const css = fs.readFileSync(cssPath, 'utf8');

function extractBlock(header: string): Record<string, string> {
  const idx = css.indexOf(header);
  if (idx === -1) return {};
  const braceStart = css.indexOf('{', idx);
  let depth = 1;
  let i = braceStart + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  const body = css.slice(braceStart + 1, i - 1);
  const vars: Record<string, string> = {};
  const varRe = /--([a-z0-9-]+):\s*([^;]+);/g;
  let mm: RegExpExecArray | null;
  while ((mm = varRe.exec(body))) {
    vars[mm[1]] = mm[2].trim().replace(/\s+/g, ' ');
  }
  return vars;
}

const root = extractBlock(':root {');
const dark = extractBlock('.dark {');

function normalize(v: string | undefined): string {
  return (v ?? '').trim().replace(/\s+/g, ' ');
}

// Divergências conhecidas e já reconciliadas (ver ledger, seção "Reconciliações").
// Cada entrada documenta por que `corporate` diverge do tokens.css literal para
// esta chave — não é uma falha do teste, é uma decisão registrada.
const KNOWN_DIVERGENCES = new Set<string>([]);

describe('§25 sincronia tokens.css ↔ corporate', () => {
  const corporate = getPresetById('corporate')!;

  it.each(CSS_VARS_TO_APPLY.map((k) => [k] as const))('%s (light) bate com :root', (key) => {
    if (KNOWN_DIVERGENCES.has(`light:${key}`)) return;
    expect(normalize(corporate.light[key])).toBe(normalize(root[key]));
  });

  it.each(CSS_VARS_TO_APPLY.map((k) => [k] as const))('%s (dark) bate com .dark', (key) => {
    if (KNOWN_DIVERGENCES.has(`dark:${key}`)) return;
    const darkValue = dark[key] !== undefined ? dark[key] : root[key];
    expect(normalize(corporate.dark[key])).toBe(normalize(darkValue));
  });
});
