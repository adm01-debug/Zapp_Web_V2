/**
 * Contrato dos tokens violeta ÓRFÃOS (cartão t_73a5c2b7).
 *
 * Os cartões-mãe migraram todos os consumidores de `--badge-new`, `--dash-violet`
 * e `--dash-tile-violet` para o par oficial `--violeta`/`--violeta-foreground`/
 * `--violeta-text`. Este contrato impede que os 3 tokens voltem: eles não podem
 * ser DECLARADOS em `src/styles/tokens.css` nem CONSUMIDOS via `var(--...)` em
 * nenhum arquivo de produção — inclusive o mapa `dash` do `tailwind.config.ts`,
 * de onde as classes `bg-dash-violet`/`bg-dash-tile-violet` saíam.
 *
 * Prova de mutação: com as definições de volta no `tokens.css` (base anterior ao
 * cartão), o primeiro caso fica vermelho; removendo-as, verde.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const tokensCss = readFileSync(path.join(raiz, 'src/styles/tokens.css'), 'utf8');

const ORFAOS = ['--badge-new', '--dash-tile-violet', '--dash-violet'];

function varrer(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === '__tests__' || nome === 'node_modules') continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...varrer(p));
    else if (/\.(ts|tsx|css)$/.test(nome)) saida.push(p);
  }
  return saida;
}

const arquivosDeProducao = [...varrer(path.join(raiz, 'src')), path.join(raiz, 'tailwind.config.ts')];

describe('tokens violeta órfãos (t_73a5c2b7) não podem voltar', () => {
  it('tokens.css não declara mais os 3 tokens órfãos', () => {
    const declarados = ORFAOS.filter((t) => new RegExp(`^\\s*${t}\\s*:`, 'm').test(tokensCss));
    expect(declarados).toEqual([]);
  });

  it('nenhum arquivo de produção consome os 3 tokens via var(--...)', () => {
    const achados: string[] = [];
    for (const arq of arquivosDeProducao) {
      const conteudo = readFileSync(arq, 'utf8');
      for (const t of ORFAOS) {
        if (conteudo.includes(`var(${t})`)) achados.push(`${path.relative(raiz, arq)} → var(${t})`);
      }
    }
    expect(achados).toEqual([]);
  });

  it('o par consolidado --violeta segue publicado no tokens.css', () => {
    expect(tokensCss).toMatch(/--violeta:\s*\d/);
  });
});
