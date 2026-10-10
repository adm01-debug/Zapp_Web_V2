/**
 * CT-74 — guarda estrutural contra a volta da troca que empurrava a faixa de KPIs.
 *
 * O CLS medido em produção (Lighthouse 12.8.2, mobile: 0,2452) era atribuído ao
 * `<div data-testid="catalog-kpi-strip">` com `boundingRect.height=240` e `top=369`.
 * A faixa NÃO muda de altura (esqueleto `h-[72px]` == estado carregado) — ela era
 * apenas EMPURRADA. Quem crescia era o bloco acima: a tela alternava um esqueleto
 * curto (`h-14` + `h-7` + `h-4`) e o `ModuleHeader` inteiro (ícone + título +
 * subtítulo de 1 linha + a fileira de botões, que no mobile ocupa mais linhas).
 *
 * A correção remove a troca: `ModuleHeader` é sempre o mesmo e o subtitle já cai em
 * `totalProducts` enquanto os stats não chegam. Este teste falha se alguém
 * reintroduzir o ternário que troca o header por um esqueleto de outra altura.
 *
 * Por que guardar a estrutura e não a geometria: jsdom não calcula layout, então um
 * teste de altura aqui seria falso. A geometria real foi medida em produção e está
 * registrada em `docs/catalogo/PERF.md` (CT-74).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ARQUIVO = resolve(__dirname, '..', 'ExternalProductManagement.tsx');

describe('CT-74 — o header da tela de catálogo é sempre o mesmo (sem troca de altura)', () => {
  const fonte = readFileSync(ARQUIVO, 'utf-8');

  it('renderiza <ModuleHeader> sem condicional de carregamento em volta', () => {
    expect(fonte).toContain('<ModuleHeader');
    // O ternário que trocava o header pelo esqueleto. Se voltar, o CLS volta.
    expect(fonte).not.toContain('{statsLoading ? (');
  });

  it('não tem mais o esqueleto curto que media diferente do header', () => {
    expect(fonte).not.toMatch(/h-14 rounded-2xl shrink-0/);
    expect(fonte).not.toMatch(/<Skeleton className="h-7 w-64" \/>/);
  });

  it('mantém o subtitle caindo em totalProducts enquanto os stats não chegam', () => {
    // É o que torna a troca desnecessária: sem stats, o número exibido é o do
    // catálogo carregado, e o texto continua sendo o mesmo (1 linha, truncado).
    expect(fonte).toMatch(/\(stats\?\.total \?\? totalProducts\)/);
  });
});
