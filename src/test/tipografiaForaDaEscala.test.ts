/**
 * SL-176 (E39-E40) — `text-[7px]` e `text-[8px]` em `src`: guarda de execucao.
 *
 * O medidor do repo (`scripts/qa/medir-tipografia.cjs`) CONTA os arbitrarios, mas nao trava
 * nenhum valor: o `--check` compara so os contadores de violacao do budget
 * (`meiaMedida`, `acima16px`, `comEquivalenteExato`, ...), e 7px/8px nao caem em nenhum deles —
 * apagar ou reinserir um `text-[8px]` passa pelo guard sem acender nada. Este arquivo prende
 * o que o guard nao prende, para o lado que o cartao fecha: 7px e 8px sao menores que o menor
 * degrau da escala (`text-3xs`, 10px/13px) e nao tem degrau proprio.
 *
 * 9px, 13px e 15px ficam de fora de proposito: o titulo do cartao pede so 7px e 8px.
 *
 * A varredura cobre codigo de PRODUTO (`.ts`/`.tsx`, sem `*.test.*`/`*.spec.*`/`__tests__`) —
 * o que se quer travar e o que o usuario ve, nao a fixture de um teste. As fixtures rodam a
 * MESMA regra sobre strings, provando os dois lados sem depender do estado de hoje.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');
const TAILWIND = join(RAIZ, 'tailwind.config.ts');

/** Os dois valores que o cartao absorve e o degrau da escala que os recebe (10px/13px). */
const ABSORVIDOS = ['text-[7px]', 'text-[8px]'] as const;

/** Mesma regra dos dois lados: devolve os arbitrarios absorvidos que aparecem no texto. */
export function ocorrenciasAbsorvidas(texto: string): string[] {
  return ABSORVIDOS.filter((alvo) => texto.includes(alvo));
}

/** Arquivos de codigo de produto sob `dir` (sem testes e sem `__tests__`). */
export function arquivosDeProduto(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'mocks') continue;
      arquivosDeProduto(p, acc);
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

describe('SL-176 — src nao tem mais text-[7px] nem text-[8px]', () => {
  const arquivos = arquivosDeProduto(SRC);

  it('varre um diretorio de verdade (o teste nao passa por nao olhar nada)', () => {
    expect(arquivos.length).toBeGreaterThan(1000);
    expect(arquivos.some((f) => f.endsWith(join('components', 'contacts', 'CompanyLogo.tsx')))).toBe(true);
  });

  it('nao sobrou nenhum text-[7px] / text-[8px]', () => {
    const restantes: string[] = [];
    for (const arquivo of arquivos) {
      readFileSync(arquivo, 'utf-8')
        .split('\n')
        .forEach((linha, i) => {
          for (const item of ocorrenciasAbsorvidas(linha)) {
            restantes.push(`${relative(RAIZ, arquivo)}:${i + 1}  ${item}`);
          }
        });
    }
    expect(
      restantes,
      `Absorva para o menor degrau da escala: 7px/8px -> text-3xs (10px/13px).\n${restantes.join('\n')}`
    ).toEqual([]);
  });

  it('o destino da absorcao existe na escala com 10px/13px', () => {
    const config = readFileSync(TAILWIND, 'utf-8');
    const m = config.match(/"3xs":\s*\[\s*"([^"]+)"\s*,\s*\{\s*lineHeight:\s*"([^"]+)"\s*\}/);
    expect(m, 'token text-3xs ausente em tailwind.config.ts').toBeTruthy();
    const px = (v: string) => (v.endsWith('rem') ? Number.parseFloat(v) * 16 : Number.parseFloat(v));
    // nomes neutros de proposito: o medidor de tipografia acusa `fontSize: <numero>` inline em src
    expect({ px: px(m![1]), lh: px(m![2]) }).toEqual({ px: 10, lh: 13 });
  });
});

describe('SL-176 — a regra da guarda (fixtures, mesma funcao)', () => {
  it('acusa os dois valores', () => {
    expect(ocorrenciasAbsorvidas('<p className="text-[7px]">x</p>')).toEqual(['text-[7px]']);
    expect(ocorrenciasAbsorvidas('<p className="text-[8px] font-bold">x</p>')).toEqual(['text-[8px]']);
  });

  it('nao acusa o degrau da escala nem o 9px (fora do titulo do cartao)', () => {
    expect(ocorrenciasAbsorvidas('<p className="text-3xs text-xs">x</p>')).toEqual([]);
    expect(ocorrenciasAbsorvidas('<p className="text-[9px]">x</p>')).toEqual([]);
    expect(ocorrenciasAbsorvidas('<div className="w-[15px] h-[8px]" />')).toEqual([]);
  });
});
