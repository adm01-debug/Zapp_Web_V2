/**
 * Guarda do kit de diálogos do Talk X (X051).
 *
 * Falha se qualquer arquivo `src/components/talkx/*.tsx` (só o nível de cima:
 * `kit/`, `tracking/` e `__tests__/` ficam de fora) contiver `<AlertDialog`,
 * `<Dialog ` ou `window.confirm` — o ciclo de vida passa pelo
 * `TalkXLifecycleDialog`/`TalkXConfirmDialog`.
 *
 * Antes vivia em `scripts/db-audit/talkx-kit-usage.test.mjs` (node:test); veio
 * para o vitest, ao lado do código que vigia, porque é guarda de `src/` e não
 * auditoria de banco.
 *
 * Exceções explícitas:
 *   - TalkXHelp.tsx              — dialog de ajuda fora do ciclo de vida
 *   - useTalkXLifecycle.tsx      — implementação do kit (usa AlertDialog internamente)
 *   - useCampaignRowActions.tsx  — ações de linha (fluxo próprio, X080)
 *   - TalkXCampaignWizard.tsx    — AlertDialog de "alterações não salvas" (navegação)
 *   - TalkXCampaignScheduled.tsx — AlertDialog de cancelarAgendamento (mantido local)
 *   - TalkXMessagePreview.tsx    — Dialog de pré-visualização (não é ciclo de vida)
 *   - TalkXTemplateEditor.tsx    — "Testar template" (envio de teste), não é ciclo de
 *     vida da campanha; a migração para TalkXDialogShell está na X050 (#2553).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TALKX_DIR = join(process.cwd(), 'src/components/talkx');

const ALLOWED_FILES = new Set([
  'TalkXHelp.tsx',
  'useTalkXLifecycle.tsx',
  'useCampaignRowActions.tsx',
  'TalkXCampaignWizard.tsx',
  'TalkXCampaignScheduled.tsx',
  'TalkXMessagePreview.tsx',
  'TalkXTemplateEditor.tsx',
]);

const FORBIDDEN = [
  { pattern: /<AlertDialog[\s>]/, label: '<AlertDialog' },
  { pattern: /<Dialog[\s>]/, label: '<Dialog ' },
  { pattern: /window\.confirm\(/, label: 'window.confirm' },
];

const entries = readdirSync(TALKX_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.tsx') && !ALLOWED_FILES.has(e.name))
  .map((e) => e.name);

describe('Talk X — diálogos só pelo kit (X051)', () => {
  it('encontra as telas do Talk X (a guarda não roda no vazio)', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  it.each(entries)('%s: sem AlertDialog/Dialog/window.confirm fora do kit', (name) => {
    const lines = readFileSync(join(TALKX_DIR, name), 'utf8').split('\n');
    const violations: string[] = [];
    for (const { pattern, label } of FORBIDDEN) {
      lines.forEach((line, i) => {
        if (pattern.test(line)) violations.push(`linha ${i + 1}: ${label}`);
      });
    }
    expect(
      violations,
      `${name} usa ${violations.join(', ')} — migre para TalkXLifecycleDialog ou TalkXConfirmDialog`,
    ).toEqual([]);
  });
});
