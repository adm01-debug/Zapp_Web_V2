#!/usr/bin/env node
/**
 * GA02: garante que o CLAUDE.md nao foi apagado ou esvaziado por outra sessao.
 * Verifica: arquivo existe, cabecalhos obrigatorios presentes, nao encolheu >30% vs HEAD.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// GA02 (plano GitHub Actions, fase 0): trava anti-apagao do CLAUDE.md.
// Reprova se perder 'Banco de dados OFICIAL', 'Perimetro do GitHub'
// ou a disciplina de CI sem desperdicio ('um PR por lote', R6), ou se
// encolher mais de 30% numa PR (wipe tipo o commit placeholder de 15/10).
export const REQUIRED_SECTIONS = [
  'Banco de dados OFICIAL',
  'Perímetro do GitHub',
  'um PR por lote',
];
export const SHRINK_THRESHOLD = 0.30;

export function avaliarClaudeMd(content, headContent) {
  const c = String(content ?? '');
  const missing = REQUIRED_SECTIONS.filter((s) => !c.includes(s));
  if (missing.length > 0) return { ok: false, motivo: 'secao obrigatoria ausente: ' + missing.join(', ') };
  if (headContent) {
    const ratio = c.length / headContent.length;
    if (ratio < (1 - SHRINK_THRESHOLD)) {
      return { ok: false, motivo: 'encolheu mais de 30% vs HEAD. Possivel wipe por sessao paralela.' };
    }
  }
  return { ok: true };
}

if (import.meta.url.endsWith(process.argv[1]?.split('/').pop() ?? '')) {
  let content;
  try {
    content = readFileSync('CLAUDE.md', 'utf8');
  } catch {
    console.error('::error::CLAUDE.md nao encontrado. Outra sessao pode ter apagado o arquivo.');
    process.exitCode = 1;
  }
  if (process.exitCode !== 1) {
    let headContent;
    try {
      headContent = execSync('git show HEAD:CLAUDE.md', { encoding: 'utf8' });
    } catch {
      headContent = null;
    }
    const veredito = avaliarClaudeMd(content, headContent);
    if (!veredito.ok) {
      console.error('::error::CLAUDE.md: ' + veredito.motivo);
      process.exitCode = 1;
    } else {
      console.log('CLAUDE.md OK: ' + REQUIRED_SECTIONS.length + ' secoes presentes, ' + content.length + ' bytes.');
    }
  }
}
