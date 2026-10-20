/**
 * J05 — `presets.ts`: as classes de efeito do Journey só podem viver sob
 * `motion-safe:` (com a contraparte neutra em `motion-reduce:`) e só podem usar
 * os tokens de cor que o sistema já tem (D02: manter as cores atuais, nenhuma
 * cor nova). O teste varre TODA string exportada pelo módulo — constante nova
 * entra na varredura sozinha.
 *
 * O item (6b) é o da recusa da 1ª entrega: **anel de foco não é movimento**, tem
 * de existir nos dois modos, e a contraparte neutra do cartão não pode apagar a
 * sombra que ele já tem (`motion-reduce:shadow-none` saiu).
 */
import { describe, expect, it } from 'vitest';
import * as presets from '../presets';
import {
  CARD_INTERACTIVE,
  CHEVRON_REVEAL,
  GLOW_RING,
  MOTION,
  STAGGER_MAX_ITEMS,
  STAGGER_PER_ITEM_MS,
  fadeSlideDelay,
} from '../presets';
import type { GlowToken } from '../presets';

const TOKENS: GlowToken[] = ['primary', 'success', 'warning', 'info', 'muted'];

/** Cores que o `tailwind.config.ts` define hoje. Nenhuma outra pode aparecer. */
const FAMILIAS_PERMITIDAS = new Set([
  'primary',
  'secondary',
  'destructive',
  'muted',
  'accent',
  'success',
  'warning',
  'info',
  'border',
  'input',
  'ring',
  'background',
  'foreground',
  'foreground-secondary',
  'card',
  'popover',
]);

const UTILITARIO_COM_COR =
  /^(?:bg|text|border|ring|from|via|to|fill|stroke|outline|decoration|divide|shadow|accent|caret)-/;
/** `shadow-md`, `shadow-sm`… são tamanhos, não cor. */
const TAMANHOS_DE_SOMBRA = /^(?:xs|sm|md|lg|xl|2xl|2xs|none|inner)$/;
/** Cores de TEXTO derivadas de um token (`muted-foreground`…). */
const DERIVADAS_DE_TOKEN =
  /^(?:muted|primary|secondary|card|accent|popover|destructive|foreground|background)-foreground$/;
/** Larguras numéricas: `ring-2`, `border-2`; `ring-offset-1` é deslocamento. */
const LARGURA = /^(?:offset-)?\d+$/;

const classes = (valor: string) => valor.split(/\s+/).filter(Boolean);

/** Devolve o motivo da recusa, ou `null` quando a classe é aceita. */
function conferirClasse(classe: string): string | null {
  if (!/^motion-(?:safe|reduce):/.test(classe)) return `classe sem variante de movimento: ${classe}`;
  if (
    /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:red|blue|green|amber|slate|gray|zinc|indigo|violet|purple|pink|orange|teal|cyan|emerald|lime|rose|sky|fuchsia|yellow|stone|neutral)-\d{2,3}\b/i.test(
      classe,
    )
  ) {
    return `cor literal (não é token do sistema): ${classe}`;
  }
  const utilidade = classe.slice(classe.lastIndexOf(':') + 1);
  if (UTILITARIO_COM_COR.test(utilidade)) {
    const familia = utilidade.replace(UTILITARIO_COM_COR, '').split('/')[0];
    const aceita =
      FAMILIAS_PERMITIDAS.has(familia) ||
      TAMANHOS_DE_SOMBRA.test(familia) ||
      DERIVADAS_DE_TOKEN.test(familia) ||
      LARGURA.test(familia);
    if (!aceita) return `token de cor que o sistema não tem: ${classe}`;
  }
  return null;
}

describe('J05 presets — só movimento e só cores do sistema', () => {
  it('(1) a varredura reconhece cor literal e classe sem variante (não passa vazia)', () => {
    expect(conferirClasse('hover:bg-red-500')).not.toBeNull();
    expect(conferirClasse('motion-safe:hover:bg-red-500/40')).not.toBeNull();
    expect(conferirClasse('motion-safe:hover:bg-roxo/50')).not.toBeNull();
    expect(conferirClasse('motion-safe:hover:bg-primary/50')).toBeNull();
    expect(conferirClasse('motion-reduce:transition-none')).toBeNull();
  });

  it('(2) toda string exportada passa na varredura', () => {
    const exportadas = Object.values(presets).filter((v): v is string => typeof v === 'string');
    const strings = [...exportadas, ...TOKENS.map((t) => GLOW_RING(t))];
    // se a varredura achar menos que as 4 constantes de classe, o filtro quebrou
    expect(strings.length).toBeGreaterThanOrEqual(4);

    const problemas = strings.flatMap((valor) => classes(valor).map(conferirClasse).filter(Boolean));
    expect(problemas).toEqual([]);
  });

  it('(3) cada efeito tem a contraparte neutra em motion-reduce', () => {
    for (const valor of [CARD_INTERACTIVE, CHEVRON_REVEAL, ...TOKENS.map((t) => GLOW_RING(t))]) {
      expect(classes(valor).some((c) => c.startsWith('motion-reduce:'))).toBe(true);
    }
  });

  it('(4) MOTION é a fonte única das durações e da curva', () => {
    expect(MOTION).toEqual({ fast: 120, base: 200, slow: 320, ease: [0.22, 1, 0.36, 1] });
  });

  it('(5) as durações das classes acompanham o MOTION (CSS e JS não divergem)', () => {
    expect(CARD_INTERACTIVE).toContain(`[${MOTION.base}ms]`);
    expect(CHEVRON_REVEAL).toContain(`[${MOTION.fast}ms]`);
  });

  it('(6) cartão: elevação 2px, sombra, borda realçada, afundar e anel de foco', () => {
    expect(CARD_INTERACTIVE).toContain('motion-safe:hover:-translate-y-0.5');
    expect(CARD_INTERACTIVE).toContain('motion-safe:hover:shadow-md');
    expect(CARD_INTERACTIVE).toMatch(/motion-safe:hover:border-\w+\/\d+/);
    expect(CARD_INTERACTIVE).toContain('motion-safe:active:scale-[0.99]');
    expect(CARD_INTERACTIVE).toMatch(/motion-safe:focus-visible:ring-\d/);
  });

  it('(6b) anel de foco existe nos DOIS modos e nada apaga a sombra base do cartão', () => {
    const aneis = classes(CARD_INTERACTIVE).filter((c) => c.includes('focus-visible:ring'));
    // anel de foco não é movimento: quem usa teclado tem de ver o mesmo realce
    // com "reduzir movimento" ligado ou desligado
    expect(aneis.some((c) => c.startsWith('motion-safe:'))).toBe(true);
    expect(aneis.some((c) => c.startsWith('motion-reduce:'))).toBe(true);
    expect(classes(CARD_INTERACTIVE)).toContain('motion-reduce:focus-visible:ring-2');
    expect(classes(CARD_INTERACTIVE)).toContain('motion-reduce:focus-visible:ring-ring/50');
    // a contraparte neutra é ficar parado — `shadow-none` apagava a sombra que o
    // cartão já tem (a sombra do hover segue sob motion-safe)
    expect(CARD_INTERACTIVE).not.toContain('shadow-none');
  });

  it('(7) setinha: aparece no hover E no foco, desliza 2px e não some com movimento reduzido', () => {
    expect(CHEVRON_REVEAL).toMatch(/motion-safe:group-hover:opacity-100/);
    expect(CHEVRON_REVEAL).toMatch(/motion-safe:group-focus-visible:opacity-100/);
    expect(CHEVRON_REVEAL).toContain('translate-x-0.5'); // 0,125rem = 2 px
    expect(CHEVRON_REVEAL).toContain('motion-reduce:opacity-100');
  });

  it('(8) GLOW_RING: uma string por token, com a cor do token dentro', () => {
    const gerados = TOKENS.map((t) => GLOW_RING(t));
    expect(new Set(gerados).size).toBe(TOKENS.length);
    TOKENS.forEach((token, i) =>
      // `muted` usa o `muted-foreground` do sistema (o `muted` cru não aparece
      // sobre o fundo do cartão): continua sendo token do sistema, sem cor nova.
      expect(gerados[i]).toMatch(new RegExp(`ring-${token}(?:-foreground)?/`)),
    );
  });

  it('(9) GLOW_RING recusa token que o sistema não tem', () => {
    expect(() => GLOW_RING('roxo' as GlowToken)).toThrow(/roxo/);
  });

  it('(10) escalonamento: 60 ms por item, teto de 8 itens', () => {
    expect(STAGGER_PER_ITEM_MS).toBe(60);
    expect(STAGGER_MAX_ITEMS).toBe(8);
    expect(fadeSlideDelay(0)).toBe(0);
    expect(fadeSlideDelay(1)).toBe(60);
    expect(fadeSlideDelay(7)).toBe(420);
    expect(fadeSlideDelay(8)).toBe(0); // do 9º em diante entra sem atraso
    expect(fadeSlideDelay(20)).toBe(0);
    expect(fadeSlideDelay(-1)).toBe(0);
  });
});
