/**
 * Guardas do kit de microinterações do chat (mesmo espírito do `presets.test` do
 * Journey): nenhuma cor literal, nenhuma família de token que o sistema não tem,
 * e o barrel sem símbolo perdido. A varredura lê o FONTE do kit — por isso o
 * próprio teste prova primeiro que a varredura não passa vazia.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as kit from '../index';

const dir = join(process.cwd(), 'src/components/inbox/chat/motion');
const fontes = readdirSync(dir)
  .filter((nome) => /\.(ts|tsx)$/.test(nome))
  .map((nome) => ({ nome, texto: readFileSync(join(dir, nome), 'utf8') }));

/** Famílias de cor de `tailwind.config.ts` (tokens do sistema) + palavras-chave. */
const FAMILIAS_ACEITAS = new Set([
  'primary',
  'primary-foreground',
  'secondary',
  'destructive',
  'destructive-foreground',
  'success-foreground',
  'warning-foreground',
  'info-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'border',
  'input',
  'ring',
  'background',
  'foreground',
  'foreground-secondary',
  'success',
  'warning',
  'info',
  'whatsapp',
  'current',
  'inherit',
  'transparent',
]);

/** Cor literal: hexadecimal, rgb()/rgba(), hsl() sem `var(...)`, paleta do Tailwind, preto/branco. */
const COR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\((?!\s*var\()|\b(?:red|blue|green|amber|slate|gray|zinc|indigo|violet|purple|pink|orange|teal|cyan|emerald|lime|rose|sky|fuchsia|yellow|stone|neutral)-\d{2,3}\b|\b(?:bg|text|border|ring|stroke|fill|from|to)-(?:white|black)\b/;

const CLASSE_COM_COR = /(?:^|[\s"':])(bg|text|border|ring|stroke|fill)-([a-z0-9-]+(?:\/\d+)?)/g;

/** Larguras (`ring-2`, `border-2`) e tamanhos de texto (`text-sm`) não são cor. */
const LARGURA = /^(?:offset-)?\d+$/;
const TAMANHO_DE_TEXTO = /^(?:xs|sm|base|lg|xl|\dxl)$/;

/** Devolve a lista de problemas do texto (vazia = passa). */
function problemas(texto: string): string[] {
  const achados: string[] = [];
  texto.split('\n').forEach((linha, i) => {
    if (linha.trimStart().startsWith('*')) return; // comentário: cita o token, não pinta nada
    const proibido = linha.match(COR_LITERAL);
    if (proibido) achados.push(`linha ${i + 1}: cor literal "${proibido[0]}"`);
    for (const achado of Array.from(linha.matchAll(CLASSE_COM_COR))) {
      const prefixo = achado[1];
      const familia = achado[2].split('/')[0];
      const aceita =
        FAMILIAS_ACEITAS.has(familia) ||
        (LARGURA.test(familia) && /^(?:border|ring|stroke)$/.test(prefixo)) ||
        (TAMANHO_DE_TEXTO.test(familia) && prefixo === 'text');
      if (!aceita) achados.push(`linha ${i + 1}: token "${familia}" fora do sistema`);
    }
  });
  return achados;
}

const EXPORTED_NAMES = [
  'MOTION_TONES',
  'AnimatedNumber',
  'DrawLine',
  'FLASH_RING_MS',
  'FlashRing',
  'MorphButton',
  'POP_BURST_MS',
  'PopBurst',
  'ShimmerSkeleton',
  'SlidingSegmented',
  'StaggerItem',
  'StaggerList',
  'formatMotionNumber',
  'toneClasses',
] as const;

describe('kit do chat — só cor do sistema, sem cor literal', () => {
  it('(1) a varredura não passa vazia: reconhece cor literal e token inexistente', () => {
    expect(problemas('const x = "bg-red-500";').length).toBeGreaterThan(0);
    expect(problemas('const x = "#22c55e";').length).toBeGreaterThan(0);
    expect(problemas('const x = "hsl(142 70% 45%)";').length).toBeGreaterThan(0);
    expect(problemas('const x = "text-white";').length).toBeGreaterThan(0);
    expect(problemas('const x = "bg-roxo/50";').length).toBeGreaterThan(0);
    expect(problemas('const x = "text-success";').length).toBe(0);
    expect(problemas('const x = "ring-2 text-sm border-2";').length).toBe(0);
    expect(problemas('const x = "hsl(var(--whatsapp))";').length).toBe(0);
  });

  it('(2) nenhum arquivo do kit tem cor literal nem token fora do sistema', () => {
    expect(fontes.length).toBeGreaterThanOrEqual(9);
    const achados = fontes.flatMap(({ nome, texto }) =>
      problemas(texto).map((p) => `${nome} → ${p}`),
    );
    expect(achados).toEqual([]);
  });

  it('(3) o barrel do kit exporta exatamente os símbolos de hoje', () => {
    expect(Object.keys(kit).sort()).toEqual([...EXPORTED_NAMES].sort());
  });

  it('(4) todo tom do kit pinta com o token do sistema (e tom inventado é erro)', () => {
    (['info', 'primary', 'success', 'warning', 'destructive', 'whatsapp'] as const).forEach((tom) => {
      const classes = kit.toneClasses(tom);
      expect(classes.bg).toBe(`bg-${tom}`);
      expect(classes.soft).toBe(`bg-${tom}/15`);
      expect(
        problemas(`const x = "${classes.text} ${classes.bg} ${classes.border} ${classes.ring} ${classes.soft}";`,),
      ).toEqual([]);
    });
    expect(() => kit.toneClasses('roxo' as never)).toThrow(/roxo/);
  });
});
