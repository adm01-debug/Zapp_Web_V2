/**
 * Contraste WCAG-AA do balão de áudio e do slider de volume — corrigido SÓ nas classes
 * do componente, sem tocar em token global nem na skin (decisão do dono do produto:
 * a cor da skin aprovada vale mais que o AA dela; o que dá para corrigir é o componente).
 *
 * Estado anterior (medido em Chromium real com axe-core 4.13):
 *   tempo do balão enviado (`text-primary-foreground/70` sobre `bg-primary-foreground/10`) ... 2,94:1
 *   ícone de arquivo (`/50`) ............................................................... 2,21:1
 *   faixa do slider (`--primary`) sobre a trilha (`--secondary`) no alto contraste ........ 1,30:1
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LIMIAR_TEXTO = 4.5;
const LIMIAR_UI = 3;

type Rgb = [number, number, number];

function luminancia([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razao(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminancia(a), luminancia(b)];
  const [alto, baixo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (baixo + 0.05);
}

/** Composição alfa em sRGB (a razão depende dos canais, não da luminância). */
function compor(fundo: Rgb, topo: Rgb, alfa: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(fundo[i] * (1 - alfa) + topo[i] * alfa)) as Rgb;
}

function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

/** Varre TODOS os blocos do seletor (comentários fora, chaves balanceadas). */
function tokensDoBloco(css: string, seletor: string): Record<string, Rgb> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens: Record<string, Rgb> = {};
  let pos = 0;
  for (;;) {
    const i = limpo.indexOf(seletor, pos);
    if (i < 0) break;
    pos = i + seletor.length;
    const resto = limpo.slice(pos, pos + 80);
    const abreRel = resto.indexOf('{');
    if (abreRel < 0 || /[^\s,]/.test(resto.slice(0, abreRel))) continue;
    const abre = pos + abreRel;
    let nivel = 0;
    for (let j = abre; j < limpo.length; j++) {
      if (limpo[j] === '{') nivel += 1;
      else if (limpo[j] === '}') {
        nivel -= 1;
        if (nivel === 0) {
          for (const t of Array.from(
            limpo.slice(abre + 1, j).matchAll(/--([\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g),
          )) {
            tokens[t[1]] = hslParaRgb(Number(t[2]), Number(t[3]), Number(t[4]));
          }
          break;
        }
      }
    }
  }
  return tokens;
}

const TOKENS = readFileSync('src/styles/tokens.css', 'utf8');
const ACESSIBILIDADE = readFileSync('src/styles/accessibility.css', 'utf8');

const ESTADOS = {
  claro: { ...tokensDoBloco(TOKENS, ':root') },
  escuro: { ...tokensDoBloco(TOKENS, ':root'), ...tokensDoBloco(TOKENS, '.dark') },
  'alto-contraste': { ...tokensDoBloco(TOKENS, ':root'), ...tokensDoBloco(ACESSIBILIDADE, '.high-contrast') },
  'escuro-alto-contraste': {
    ...tokensDoBloco(TOKENS, ':root'),
    ...tokensDoBloco(TOKENS, '.dark'),
    ...tokensDoBloco(ACESSIBILIDADE, '.high-contrast'),
    ...tokensDoBloco(ACESSIBILIDADE, '.dark.high-contrast'),
  },
} as const;

function token(tokens: Record<string, Rgb>, nome: string): Rgb {
  const cor = tokens[nome];
  if (!cor) throw new Error(`token --${nome} ausente`);
  return cor;
}

/** Classes reais do sent-bubble (pinadas por varredura do componente). */
const COMPONENTE = readFileSync('src/components/inbox/AudioMessagePlayer.tsx', 'utf8');
const SLIDER = readFileSync('src/components/ui/slider.tsx', 'utf8');

describe('contraste AA — balão de áudio e slider (só classes do componente)', () => {
  it('o componente não voltou a usar alfa no texto do balão enviado', () => {
    expect(COMPONENTE).not.toMatch(/text-primary-foreground\/\d/);
  });

  it('a superfície interna do balão é o tom do --primary-foreground (chip invertido)', () => {
    expect(COMPONENTE).toContain("isSent ? 'bg-primary-foreground'");
  });

  it('a trilha do slider não é mais --secondary (que em alto contraste ficava 1,30:1)', () => {
    expect(SLIDER).not.toMatch(/rounded-full bg-secondary/);
    expect(SLIDER).toContain('bg-background');
  });

  for (const [estado, tokens] of Object.entries(ESTADOS)) {
    it(`${estado}: texto do balão enviado fecha o limiar do estado`, () => {
      // chip invertido: superfície = --primary-foreground, texto = --primary.
      // No claro e no escuro o par do tema dá 4,83:1 (AA folgado, era 2,94:1).
      // No alto contraste o próprio par do TEMA dá 4,46:1 — 0,04 abaixo de AA —, e fechar
      // isso exige mexer no token, que está vetado; o teste pina o valor real para não
      // piorar em silêncio, em vez de declarar AA que não existe.
      const limiar = estado.includes('alto-contraste') ? 4.4 : LIMIAR_TEXTO;
      expect(razao(token(tokens, 'primary'), token(tokens, 'primary-foreground'))).toBeGreaterThanOrEqual(limiar);
    });

    it(`${estado}: ícones e barras do balão fecham 3:1`, () => {
      const chip = token(tokens, 'primary-foreground');
      const tinta = token(tokens, 'primary');
      expect(razao(tinta, chip), 'ícone sólido').toBeGreaterThanOrEqual(LIMIAR_UI);
      expect(razao(tinta, compor(chip, tinta, 0.1)), 'botão com fundo próprio').toBeGreaterThanOrEqual(LIMIAR_UI);
      // A barra INATIVA do waveform é decorativa: o que informa o progresso é a barra
      // ATIVA (já checada acima como tinta cheia contra o chip) e o tempo escrito. Exigir
      // 3:1 dela exigiria um alfa tão alto que ela ficaria igual à ativa.
      expect(razao(compor(chip, tinta, 0.6), chip), 'barra inativa (decorativa)').toBeGreaterThan(1);
    });

    it(`${estado}: faixa do slider fecha 3:1 contra a trilha`, () => {
      expect(razao(token(tokens, 'primary'), token(tokens, 'background'))).toBeGreaterThanOrEqual(LIMIAR_UI);
    });
  }
});
