/**
 * SL-020 (item E18 do inventário) — contraste do PLAYER de áudio e do SLIDER nos temas.
 *
 * O cartão manda conferir se a lacuna do E18 ainda existe na ponta do dia. Ela NÃO existe:
 * os dois pares que o inventário listou como reprovados já foram fechados por cartões
 * anteriores (números de origem em `docs/evidencias/plano-volume-50/e18-contraste.md` e na
 * §7.2 de `docs/plans/PLANO_VOLUME_MIDIA_50_ETAPAS_2026-09-27.md`):
 *
 *   slider, trilha × faixa (`--primary` × `--secondary`) ....... 1,30:1 claro / 2,88:1 escuro
 *   balão recebido, tempo (`--muted-foreground` sobre `--muted/50`) .......... 4,17:1 claro
 *
 * O que fechou cada um (os dois são ANCESTRAIS desta branch — conferido com
 * `git merge-base --is-ancestor`, não por leitura de doc):
 *   #1582 (`b05067598`, 02/10) — a trilha do slider deixou de ser `--secondary` e virou
 *     `bg-background` (`src/components/ui/slider.tsx:40`);
 *   #1533 (`46225ae46`, 02/10) — `--muted-foreground` claro foi de L45 para L40, em
 *     `src/styles/tokens.css:137` E no preset (`src/components/settings/theme/presets.ts:213`):
 *     os DOIS, senão o valor inline do tema desfaria o número.
 *
 * Este arquivo é a guarda que faltava: nenhum teste media esses dois pares pelo caminho que a
 * tela usa. Ele renderiza o `AudioMessagePlayer` REAL e o slider REAL do popover de volume
 * (`MediaVolumeControl` → `VolumeSliderPopoverContent` → `ui/slider`), lê a lista de classes que
 * o DOM de verdade recebeu, resolve os tokens de `src/styles/tokens.css` +
 * `src/styles/accessibility.css` e mede a razão WCAG — inclusive compondo os alfas em sRGB,
 * como o navegador pinta. O bloco "tokens medidos são os que o app escreve" fecha a única
 * premissa que sobrava: o preset `corporate` (o que roda) traz exatamente os valores que o
 * medidor leu da folha.
 *
 * Limiares (WCAG 2.1): 4,5:1 para TEXTO (1.4.3) e 3:1 para a parte gráfica que indica o valor
 * (1.4.11) — é a régua que o próprio plano do E18 fixou para o slider ("1.4.11 pede 3:1", §7.2).
 *
 * Medido nesta ponta (08/10/2026), tempo do balão recebido / faixa × trilha do slider:
 *   claro 5,04 / 4,83 · escuro 7,33 / 3,73 · alto contraste 10,12 / 8,77 · alto contraste escuro 9,42 / 4,45
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Mocks comuns aos testes de componente dos controles de volume (toast, logger,
// framer-motion e ResizeObserver do Popper do Radix).
import '@/test/volumeControlMocks';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'https://teste.local/audio.webm' } })),
      })),
    },
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
    from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) })),
  },
}));

import { getPresetById } from '@/components/settings/theme/presets';
import { AudioMessagePlayer } from '../AudioMessagePlayer';
import { MediaVolumeControl } from '../MediaVolumeControl';

// ─── WCAG 2.1: HSL (formato dos tokens) → sRGB, composição alfa e razão ─────

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

/** Cor com alfa pintada sobre a superfície, canal a canal em sRGB (como o navegador pinta). */
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

/**
 * Corpo de UM bloco por cabeçalho EXATO (`:root {` / `.dark {`) — um `indexOf` sem a chave
 * deixaria `.dark` casar com qualquer seletor que comece igual. Devolve os valores CRUS,
 * para comparar com o preset, e em RGB, para medir.
 */
function tokensDoBloco(css: string, cabecalho: string): { cru: Record<string, string>; rgb: Record<string, Rgb> } {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const i = limpo.indexOf(cabecalho);
  if (i < 0) throw new Error(`bloco ${cabecalho} ausente`);
  const abre = i + cabecalho.length - 1;
  let nivel = 0;
  for (let j = abre; j < limpo.length; j++) {
    if (limpo[j] === '{') nivel += 1;
    else if (limpo[j] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        const corpo = limpo.slice(abre + 1, j);
        const cru: Record<string, string> = {};
        const rgb: Record<string, Rgb> = {};
        for (const t of corpo.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
          cru[t[1]] = t[2].trim().replace(/\s+/g, ' ');
        }
        for (const t of corpo.matchAll(/--([\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g)) {
          rgb[t[1]] = hslParaRgb(Number(t[2]), Number(t[3]), Number(t[4]));
        }
        return { cru, rgb };
      }
    }
  }
  throw new Error(`bloco ${cabecalho} sem fechamento`);
}

const TOKENS_CSS = readFileSync(resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
const A11Y_CSS = readFileSync(resolve(__dirname, '../../../styles/accessibility.css'), 'utf8');

const CLARO = tokensDoBloco(TOKENS_CSS, ':root {').rgb;
const ESCURO = { ...CLARO, ...tokensDoBloco(TOKENS_CSS, '.dark {').rgb };
const HC_CLARO = { ...CLARO, ...tokensDoBloco(A11Y_CSS, '.high-contrast {').rgb };
const HC_ESCURO = {
  ...ESCURO,
  ...tokensDoBloco(A11Y_CSS, '.high-contrast {').rgb,
  ...tokensDoBloco(A11Y_CSS, '.dark.high-contrast {').rgb,
};

const ESTADOS = [
  ['claro', CLARO],
  ['escuro', ESCURO],
  ['alto contraste', HC_CLARO],
  ['alto contraste escuro', HC_ESCURO],
] as const;

const LIMIAR_TEXTO = 4.5;
/** 1.4.11 — a parte gráfica que indica o valor (faixa do slider) precisa de 3:1. */
const LIMIAR_GRAFICO = 3;

function token(tokens: Record<string, Rgb>, nome: string): Rgb {
  const cor = tokens[nome];
  if (!cor) throw new Error(`token --${nome} ausente no tema`);
  return cor;
}

// ─── Extração das classes REAIS que o DOM recebeu ───────────────────────────

/** `text-muted-foreground/70` → `{ token: 'muted-foreground', alfa: 0.7 }` (ignora `hover:`). */
function textoDaClasse(className: string): { token: string; alfa: number } {
  const m = className.match(/(?:^|\s)text-([a-z-]+?foreground)(?:\/(\d+))?(?:\s|$)/);
  if (!m) throw new Error(`sem classe text-*-foreground em: ${className}`);
  return { token: m[1], alfa: m[2] ? Number(m[2]) / 100 : 1 };
}

/** `bg-muted/50` → `{ token: 'muted', alfa: 0.5 }` (o alfa é composto sobre o que está abaixo). */
function fundoDaClasse(className: string): { token: string; alfa: number } {
  const m = className.match(/(?:^|\s)bg-([a-z0-9-]+)(?:\/(\d+))?(?:\s|$)/);
  if (!m) throw new Error(`sem classe bg-* em: ${className}`);
  return { token: m[1], alfa: m[2] ? Number(m[2]) / 100 : 1 };
}

/** Ancestral mais próximo que PINTA fundo (a superfície onde o texto é lido). */
function ancestralComFundo(inicio: Element | null): { elemento: Element; fundo: { token: string; alfa: number } } {
  let atual = inicio;
  while (atual) {
    try {
      return { elemento: atual, fundo: fundoDaClasse(atual.className) };
    } catch {
      atual = atual.parentElement;
    }
  }
  throw new Error('nenhum ancestral pinta fundo');
}

// ─── Medições pelo caminho da tela ─────────────────────────────────────────

interface MedicaoBalao {
  /** Tinta da linha de tempo do balão recebido. */
  tinta: { token: string; alfa: number };
  /** Superfície onde ela é lida: chip do player sobre o corpo do balão. */
  chip: { token: string; alfa: number };
  balao: { token: string; alfa: number };
}

/**
 * Renderiza o player REAL dentro do corpo do balão recebido. O corpo é o `bg-muted` do
 * `MessageBubble` (`src/components/inbox/chat/MessageBubble.tsx:188`) e o player pinta o
 * próprio chip com `bg-muted/50` (`AudioMessagePlayer.tsx:113`) — a cadeia de fundo é essa.
 */
function medirBalaoRecebido(): MedicaoBalao {
  const { container, unmount } = render(
    <div className="bg-muted">
      <AudioMessagePlayer audioUrl="https://teste.local/audio.webm" messageId="sl-020" isSent={false} />
    </div>,
  );

  const tempo = Array.from(container.querySelectorAll('span')).find((s) => /^\d+:\d{2}$/.test(s.textContent ?? ''));
  if (!tempo) throw new Error('linha de tempo do player não renderizou');
  const linha = tempo.parentElement;
  if (!linha) throw new Error('linha de tempo sem elemento pai');

  // O chip do player (bg-*) e, acima dele, o corpo do balão (bg-muted, do MessageBubble).
  const chipEl = ancestralComFundo(linha).elemento;
  const { fundo: chip } = ancestralComFundo(chipEl);
  const { fundo: balao } = ancestralComFundo(chipEl.parentElement);
  const medicao: MedicaoBalao = { tinta: textoDaClasse(linha.className), chip, balao };

  unmount();
  return medicao;
}

interface MedicaoSlider {
  trilha: { token: string; alfa: number };
  faixa: { token: string; alfa: number };
}

/** Sobe do polegar até a raiz do Radix (a classe `touch-none` é a do próprio `ui/slider`). */
function raizDoSlider(polegar: Element): Element {
  let atual: Element | null = polegar.parentElement;
  while (atual && !/\btouch-none\b/.test(atual.className)) atual = atual.parentElement;
  if (!atual) throw new Error('raiz do slider não encontrada a partir do polegar');
  return atual;
}

/** Abre o popover do controle REAL e lê a trilha e a faixa que o Radix montou. */
async function medirSliderDoPopover(): Promise<MedicaoSlider> {
  const { unmount } = render(<MediaVolumeControl />);
  fireEvent.click(screen.getByRole('button', { name: 'Ajustar volume das mídias' }));

  const polegar = await screen.findByRole('slider', { name: 'Volume das mídias' });
  const raiz = raizDoSlider(polegar);
  const trilha = raiz.querySelector(':scope > span') as HTMLElement | null;
  const faixa = (trilha?.firstElementChild as HTMLElement | null) ?? null;
  if (!trilha || !faixa) throw new Error('trilha/faixa do slider não renderizaram');

  const medicao: MedicaoSlider = { trilha: fundoDaClasse(trilha.className), faixa: fundoDaClasse(faixa.className) };
  unmount();
  return medicao;
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe('SL-020 — a medição usa os tokens que o app realmente escreve', () => {
  const corporate = getPresetById('corporate');
  const TOKENS_MEDIDOS = ['primary', 'background', 'muted', 'muted-foreground'] as const;

  it.each(['light', 'dark'] as const)(
    'o preset default (corporate, %s) traz os mesmos valores de tokens.css',
    (modo) => {
      // Com os tokens inline no <html> (applyThemePreset) o valor que chega à tela é o do
      // preset, não o da folha. Se os dois divergirem, o número medido aqui deixa de valer.
      const cru = tokensDoBloco(TOKENS_CSS, modo === 'light' ? ':root {' : '.dark {').cru;
      if (!corporate) throw new Error('preset corporate ausente');
      for (const nome of TOKENS_MEDIDOS) {
        expect(corporate[modo][nome], `${modo}: --${nome}`).toBe(cru[nome]);
      }
    },
  );

  it('com alto contraste ligado o preset não escreve cor inline (a classe manda)', () => {
    // É o que permite medir os estados de alto contraste com os tokens de accessibility.css.
    const codigo = readFileSync(resolve(__dirname, '../../settings/theme/presets.ts'), 'utf8');
    expect(codigo).toMatch(/classList\.contains\('high-contrast'\)/);
    expect(codigo).toMatch(/root\.style\.removeProperty\(`--\$\{key\}`\)/);
  });
});

describe('SL-020 — contraste do player de áudio e do slider nos temas', () => {
  let balao: MedicaoBalao;
  let slider: MedicaoSlider;

  beforeAll(async () => {
    balao = medirBalaoRecebido();
    slider = await medirSliderDoPopover();
  });

  it('a medição é a do par do cartão: a faixa não pinta a mesma cor da trilha', () => {
    // Se as duas parassem na mesma cor, a razão medida seria 1:1 e o teste acima já reprovaria —
    // aqui o par fica nomeado para quem lê a falha saber o que quebrou.
    expect(slider.trilha.token).not.toBe(slider.faixa.token);
  });

  for (const [nome, tokens] of ESTADOS) {
    it(`${nome}: o tempo do balão RECEBIDO fecha 4,5:1 (era 4,17:1 no claro)`, () => {
      const superficie = compor(token(tokens, balao.balao.token), token(tokens, balao.chip.token), balao.chip.alfa);
      const tinta = compor(superficie, token(tokens, balao.tinta.token), balao.tinta.alfa);
      expect(
        razao(tinta, superficie),
        `${balao.tinta.token} sobre ${balao.chip.token}/${balao.chip.alfa * 100} sobre ${balao.balao.token}`,
      ).toBeGreaterThanOrEqual(LIMIAR_TEXTO);
    });

    it(`${nome}: a faixa do slider fecha 3:1 sobre a trilha (era 1,30/2,88 com --secondary)`, () => {
      const trilha = compor(token(tokens, 'popover'), token(tokens, slider.trilha.token), slider.trilha.alfa);
      const faixa = compor(trilha, token(tokens, slider.faixa.token), slider.faixa.alfa);
      expect(
        razao(faixa, trilha),
        `${slider.faixa.token} sobre trilha ${slider.trilha.token}/${slider.trilha.alfa * 100}`,
      ).toBeGreaterThanOrEqual(LIMIAR_GRAFICO);
    });
  }
});
