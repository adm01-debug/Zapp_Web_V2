import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contrato do ENCERRAMENTO da Telefonia (T100).
 *
 * O T100 fecha a documentação do módulo: (a) o plano vivo
 * (`PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md`) ganha a seção de
 * encerramento com o checklist final, os links das PRs e as pendências/resíduos
 * honestas; (b) o ledger antigo (`TELEFONIA_STATUS.md`) recebe a **linha final**
 * "superado por `<plano vivo>`" e para de receber etapas.
 *
 * O contrato cobra as duas metades e a COERÊNCIA entre elas: o alvo declarado no
 * fim do ledger tem de existir no repositório e ser o mesmo plano que a nota do
 * topo anuncia; as etapas e as PRs citadas no encerramento têm de existir no
 * próprio plano. Nada aqui congela o estado das caixas `[x]`/`[ ]` — a regra é a
 * forma do fechamento, não a fotografia do dia.
 */

const STATUS = 'docs/design/TELEFONIA_STATUS.md';
const PLANO = 'docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md';

const status = (): string => readFileSync(STATUS, 'utf8');
const plano = (): string => readFileSync(PLANO, 'utf8');

/** Último bloco do arquivo: o texto depois do último separador `---` de linha inteira. */
function blocoFinal(md: string): string {
  const linhas = md.split('\n');
  let ultimo = -1;
  linhas.forEach((linha, i) => {
    if (linha.trim() === '---') ultimo = i;
  });
  return linhas.slice(ultimo + 1).join('\n');
}

/** Caminho declarado em "superado por `<caminho>`" (null quando a linha não existe). */
function alvoSuperado(texto: string): string | null {
  const m = texto.match(/superado\s+por\b\**\s*`([^`\n]+)`/i);
  return m ? m[1].trim() : null;
}

/** Plano vivo anunciado no topo do ledger ("O plano vivo passa a ser `<...>`"). */
function planoVivoDoTopo(texto: string): string | null {
  const m = texto.match(/plano vivo passa a ser[\s>]*`([^`\n]+)`/i);
  return m ? m[1].trim() : null;
}

/** A sucessão está declarada no bloco FINAL do arquivo? */
function sucessaoDeclarada(md: string, esperado: string): boolean {
  return alvoSuperado(blocoFinal(md)) === esperado;
}

/** Índice do título da seção de encerramento (T100) no plano; -1 quando ausente. */
function inicioEncerramento(md: string): number {
  const m = md.match(/^##[^\n]*\bEncerramento\b[^\n]*T100[^\n]*$/m);
  return m && m.index !== undefined ? m.index : -1;
}

/** Texto da seção de encerramento (T100), do título até o próximo `## `. */
function secaoEncerramento(md: string): string {
  const inicio = inicioEncerramento(md);
  if (inicio < 0) return '';
  const depois = md.slice(inicio);
  const fim = depois.slice(1).search(/^##\s/m);
  return fim === -1 ? depois : depois.slice(0, fim + 1);
}

/** Etapas (T01–T100) presentes no checklist do plano. */
function idsDoChecklist(md: string): Set<number> {
  const ids = Array.from(md.matchAll(/^- \[[ x]\] \*\*T(\d+)\*\*/gm)).map((m) =>
    Number(m[1]),
  );
  return new Set(ids);
}

/** Etapas citadas num texto (T06, T75, T100...). */
function idsCitados(texto: string): number[] {
  const ids = Array.from(texto.matchAll(/\bT(\d{1,3})\b/g)).map((m) =>
    Number(m[1]),
  );
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

/** Números de PR citados num texto (#1181...). */
function prsCitadas(texto: string): string[] {
  const prs = Array.from(texto.matchAll(/#(\d{3,5})\b/g)).map((m) => m[1]);
  return Array.from(new Set(prs)).sort();
}

describe('ledger antigo encerrado: linha final de sucessão (T100)', () => {
  it('termina declarando por quem foi superado', () => {
    expect(
      alvoSuperado(blocoFinal(status())),
      'a última seção do ledger precisa declarar "superado por `<plano vivo>`"',
    ).toBe(PLANO);
  });

  it('o plano declarado existe no repositório', () => {
    const alvo = alvoSuperado(blocoFinal(status()));
    expect(alvo, 'sem alvo declarado não há o que conferir').not.toBeNull();
    expect(existsSync(alvo as string), `${alvo} não existe`).toBe(true);
  });

  it('o topo e a linha final apontam para o mesmo plano vivo', () => {
    expect(
      planoVivoDoTopo(status()),
      'a nota do topo (T01) e a linha final (T100) precisam concordar',
    ).toBe(alvoSuperado(blocoFinal(status())));
  });

  it('recusa o arquivo sem a linha final', () => {
    const semLinha = status().replace(
      /superado\s+por\b\**\s*`[^`\n]+`/i,
      'encerrado em 08/10/2026',
    );
    expect(sucessaoDeclarada(semLinha, PLANO)).toBe(false);
  });

  it('recusa a linha final apontando outro plano', () => {
    const outroAlvo = status().replace(
      /superado\s+por\b\**\s*`[^`\n]+`/i,
      'superado por `docs/design/PLANO_ANTIGO.md`',
    );
    expect(sucessaoDeclarada(outroAlvo, PLANO)).toBe(false);
  });

  it('recusa a linha de sucessão fora do bloco final', () => {
    const noMeio = [
      '# Ledger antigo',
      '',
      `> superado por \`${PLANO}\``,
      '',
      '---',
      '',
      'conteúdo posterior que não é o fechamento do ledger',
      '',
    ].join('\n');
    expect(sucessaoDeclarada(noMeio, PLANO)).toBe(false);
  });
});

describe('plano vivo: encerramento documental (T100)', () => {
  const sec = (): string => secaoEncerramento(plano());

  it('o plano vivo se declara o ledger vivo', () => {
    expect(plano()).toMatch(/passa a ser o ledger vivo/i);
  });

  it('traz a seção de encerramento com checklist final, links das PRs e pendências/resíduos', () => {
    expect(sec(), 'falta a seção "Encerramento (T100)" no plano vivo').not.toBe('');
    expect(sec(), 'falta o checklist final').toMatch(/checklist final/i);
    expect(sec(), 'faltam os links das PRs').toMatch(/links das PRs/i);
    expect(sec(), 'faltam as pendências').toMatch(/pend[êe]ncias/i);
    expect(sec(), 'faltam os resíduos').toMatch(/res[íi]duos/i);
    expect(
      prsCitadas(sec()).length,
      'o encerramento precisa citar as PRs das fases fechadas',
    ).toBeGreaterThan(0);
  });

  it('aponta o ledger antigo que ele substitui', () => {
    expect(sec(), `o encerramento precisa nomear ${STATUS}`).toContain(STATUS);
  });

  it('o checklist do plano cobre T01–T100 sem buraco', () => {
    const checklist = idsDoChecklist(plano());
    const faltando = Array.from({ length: 100 }, (_, i) => i + 1).filter(
      (id) => !checklist.has(id),
    );
    expect(
      faltando,
      `etapas ausentes do checklist: ${faltando.join(', ')}`,
    ).toEqual([]);
  });

  it('toda etapa citada no encerramento existe no checklist', () => {
    const checklist = idsDoChecklist(plano());
    const orfas = idsCitados(sec()).filter((id) => !checklist.has(id));
    expect(
      orfas,
      `etapas citadas no encerramento que não existem no checklist: ${orfas.join(', ')}`,
    ).toEqual([]);
  });

  it('todo link de PR do encerramento está registrado antes dele no plano', () => {
    const inicio = inicioEncerramento(plano());
    expect(
      inicio,
      'sem a seção de encerramento não dá para conferir as PRs',
    ).toBeGreaterThan(-1);
    const registradas = new Set(prsCitadas(plano().slice(0, inicio)));
    const inventadas = prsCitadas(sec()).filter((pr) => !registradas.has(pr));
    expect(
      inventadas,
      `PRs citadas só no encerramento (sem registro no plano): ${inventadas.join(', ')}`,
    ).toEqual([]);
  });
});
