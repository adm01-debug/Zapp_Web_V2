#!/usr/bin/env node
/**
 * talkx-kit-usage.test.mjs (X051)
 *
 * Falha se qualquer arquivo `src/components/talkx/*.tsx` (excluídos `kit/`,
 * `tracking/`, `__tests__/` e os arquivos explicitamente excluídos abaixo)
 * contiver `<AlertDialog`, `<Dialog ` ou `window.confirm`.
 *
 * Exceções explícitas:
 *   - TalkXHelp.tsx           — dialog de ajuda fora do ciclo de vida
 *   - useTalkXLifecycle.tsx   — implementação do kit (usa AlertDialog internamente)
 *   - useCampaignRowActions.tsx — ações de linha (fluxo próprio, X080)
 *   - TalkXCampaignWizard.tsx   — AlertDialog de "alterações não salvas" (navegação)
 *   - TalkXCampaignScheduled.tsx — AlertDialog de cancelarAgendamento (mantido local)
 *   - TalkXMessagePreview.tsx   — Dialog de pré-visualização (não é ciclo de vida)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TALKX_DIR = join(process.cwd(), 'src/components/talkx');

const ALLOWED_FILES = new Set([
  'TalkXHelp.tsx',
  'useTalkXLifecycle.tsx',
  'useCampaignRowActions.tsx',
  'TalkXCampaignWizard.tsx',
  'TalkXCampaignScheduled.tsx',
  'TalkXMessagePreview.tsx',
]);

const FORBIDDEN = [
  { pattern: /<AlertDialog[\s>]/, label: '<AlertDialog' },
  { pattern: /<Dialog[\s>]/, label: '<Dialog ' },
  { pattern: /window\.confirm\(/, label: 'window.confirm' },
];

const entries = readdirSync(TALKX_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.tsx') && !ALLOWED_FILES.has(e.name));

for (const entry of entries) {
  test(`${entry.name}: sem AlertDialog/Dialog/window.confirm fora do kit`, () => {
    const source = readFileSync(join(TALKX_DIR, entry.name), 'utf8');
    const lines = source.split('\n');
    const violations = [];
    for (const { pattern, label } of FORBIDDEN) {
      lines.forEach((line, i) => {
        if (pattern.test(line)) violations.push(`linha ${i + 1}: ${label}`);
      });
    }
    assert.deepEqual(
      violations,
      [],
      `${entry.name} usa ${violations.join(', ')} — migre para TalkXLifecycleDialog ou TalkXConfirmDialog`,
    );
  });
}
