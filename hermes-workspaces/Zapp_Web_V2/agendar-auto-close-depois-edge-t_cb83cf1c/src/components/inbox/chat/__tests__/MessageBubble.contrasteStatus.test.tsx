/**
 * #184 / VOL-03 — contraste da linha de status do balão (horário, "editada" e ícone de estado).
 *
 * O defeito: o horário do balão pinta a cor do balão COM ALFA —
 * `text-primary-foreground/60` no ENVIADO e `text-muted-foreground/70` no RECEBIDO — e o alfa
 * derruba a razão abaixo da régua AA (4,5:1) para texto de 11px (`text-2xs`). Nenhum contrato
 * media essa linha, então o valor abaixo da régua passou em silêncio (é o mesmo defeito que o
 * PR #1582 corrigiu no balão de áudio e deixou aqui).
 *
 * Como este teste prova: renderiza o `MessageBubble` REAL (jsdom), lê a lista de classes que o
 * horário REALMENTE recebeu, extrai dessas classes o token de texto, o alfa e a superfície do
 * balão, resolve os tokens de `src/styles/tokens.css` + `src/styles/accessibility.css` nos
 * quatro estados de tema, compõe o alfa em sRGB e mede a razão WCAG. Nada de literal pinado:
 * se a classe do componente mudar, o número muda com ela.
 *
 * Medido no estado anterior (alfa no texto):
 *   ENVIADO  `text-primary-foreground/60` sobre `bg-primary` ... 2,86:1 (claro e escuro)
 *   RECEBIDO `text-muted-foreground/70`   sobre `bg-muted` ..... 2,82:1 (claro)
 */
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '../MessageBubble';
import { Message } from '@/types/chat';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert: async () => ({ error: null }) }), storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: async () => ({ error: null }) }) }, functions: { invoke: async () => ({ data: null, error: null }) } },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { name: 'Ana' } }) }));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/components/mobile/SwipeableMessage', () => ({
  SwipeableMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({
      children,
      whileHover: _whileHover,
      transition: _transition,
      ...rest
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...rest}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/inbox/DeletedMessagePlaceholder', () => ({ DeletedMessagePlaceholder: () => null }));
vi.mock('@/components/inbox/TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('@/components/inbox/ImagePreview', () => ({ MessageImage: () => null }));
vi.mock('@/components/inbox/MediaPreview', () => ({ DocumentPreview: () => null, VideoPreview: () => null }));
vi.mock('@/components/inbox/AudioMessagePlayer', () => ({ AudioMessagePlayer: () => null }));
vi.mock('@/components/inbox/InteractiveMessage', () => ({
  InteractiveMessageDisplay: () => null,
  ButtonResponseBadge: () => null,
}));
vi.mock('@/components/inbox/ReplyQuote', () => ({ QuotedMessage: () => null }));
vi.mock('@/components/inbox/TextToSpeechButton', () => ({ TextToSpeechButton: () => null }));
vi.mock('@/components/inbox/MessageReactions', () => ({
  MessageReactions: () => null,
  QuickReactionBar: () => null,
}));
vi.mock('@/components/inbox/chat/HighlightedText', () => ({
  HighlightedText: ({ text }: { text: string }) => <>{text}</>,
}));
vi.mock('@/components/inbox/chat/MessageHoverToolbar', () => ({ MessageHoverToolbar: () => null }));
vi.mock('@/components/security/QuarantineBadge', () => ({ QuarantineBadge: () => null }));
vi.mock('@/components/inbox/chat/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: () => null,
  AvatarFallback: () => null,
  AvatarImage: () => null,
}));

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

/** Texto com alfa sobre a superfície, como o navegador pinta (sRGB, canal a canal). */
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
 * Tokens de UM bloco por cabeçalho EXATO (`seletor {`). Um `indexOf` simples deixaria
 * `.high-contrast` casar também com `.dark.high-contrast` (substring) e o estado de alto
 * contraste CLARO seria medido com os tokens do ESCURO.
 */
function tokensDoBloco(css: string, cabecalho: string): Record<string, Rgb> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const alvo = `${cabecalho} {`;
  const i = limpo.indexOf(alvo);
  if (i < 0) throw new Error(`bloco ${cabecalho} ausente`);
  const abre = i + alvo.length - 1;
  let nivel = 0;
  for (let j = abre; j < limpo.length; j++) {
    if (limpo[j] === '{') nivel += 1;
    else if (limpo[j] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        const out: Record<string, Rgb> = {};
        for (const t of Array.from(
          limpo
            .slice(abre + 1, j)
            .matchAll(/--([\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g),
        )) {
          out[t[1]] = hslParaRgb(Number(t[2]), Number(t[3]), Number(t[4]));
        }
        return out;
      }
    }
  }
  throw new Error(`bloco ${cabecalho} sem fechamento`);
}

const TOKENS = readFileSync('src/styles/tokens.css', 'utf8');
const A11Y = readFileSync('src/styles/accessibility.css', 'utf8');

const CLARO = tokensDoBloco(TOKENS, ':root');
const ESCURO = { ...CLARO, ...tokensDoBloco(TOKENS, '.dark') };
const HC_CLARO = { ...CLARO, ...tokensDoBloco(A11Y, '.high-contrast') };
const HC_ESCURO = {
  ...ESCURO,
  ...tokensDoBloco(A11Y, '.high-contrast'),
  ...tokensDoBloco(A11Y, '.dark.high-contrast'),
};

const ESTADOS = [
  ['claro', CLARO],
  ['escuro', ESCURO],
  ['alto contraste', HC_CLARO],
  ['alto contraste escuro', HC_ESCURO],
] as const;

/**
 * Resíduo declarado (risco aceito, #184/VOL-03): no alto contraste ESCURO o par do PRÓPRIO
 * TEMA (`--primary` × `--primary-foreground`, 258 100% 65% sobre preto) fecha 4,46:1 —
 * 0,04 abaixo de AA. Fechar isso exige mexer no token da paleta de acessibilidade; o ajuste
 * global de contraste foi revertido no PR #1458 por decisão do dono do produto e o PR #1582
 * registrou a mesma pendência. O teste pina o número real em vez de declarar AA inexistente —
 * e fica vermelho se piorar.
 */
const RESIDUO_TEMA_HC_ESCURO = 4.45;

const LIMIAR_TEXTO = 4.5;

// ─── Extração das classes REAIS aplicadas pelo componente renderizado ───────

/** Classes do token de texto (com alfa opcional): `text-primary-foreground/60` → [token, 0.6]. */
function textoDaClasse(className: string): { token: string; alfa: number } {
  const m = className.match(/(?:^|\s)text-((?:[a-z-]+-)?foreground)(?:\/(\d+))?(?:\s|$)/);
  if (!m) throw new Error(`sem classe text-*-foreground em: ${className}`);
  return { token: m[1], alfa: m[2] ? Number(m[2]) / 100 : 1 };
}

/** Token de superfície do balão: `bg-primary` / `bg-muted`. */
function fundoDaClasse(className: string): string {
  const m = className.match(/(?:^|\s)bg-(primary|muted)(?:\s|$)/);
  if (!m) throw new Error(`sem classe bg-primary/bg-muted em: ${className}`);
  return m[1];
}

interface Medicao {
  texto: string;
  fundo: string;
  alfa: number;
}

/** Renderiza o balão REAL e devolve as classes que o horário e a superfície receberam. */
function medirBalão(enviado: boolean): Medicao {
  const { container, unmount } = render(
    <MessageBubble
      message={
        {
          id: 'm-184',
          content: 'bom dia',
          sender: enviado ? 'agent' : 'contact',
          timestamp: new Date('2026-10-05T12:00:00Z'),
          type: 'text',
          status: 'read',
        } as Message
      }
      isFirstInGroup
      isLastInGroup
      ttsLoading={false}
      ttsPlaying={false}
      ttsMessageId={null}
      onSpeak={vi.fn()}
      onStop={vi.fn()}
      onReply={vi.fn()}
      onForward={vi.fn()}
      onCopy={vi.fn()}
      onScrollToMessage={vi.fn()}
      onInteractiveButtonClick={vi.fn()}
      onMessageDeleted={vi.fn()}
      registerRef={vi.fn()}
    />,
  );

  // O horário é o <span> cujo texto é HH:mm (text-2xs font-medium, MessageBubble.tsx:299).
  const horario = Array.from(container.querySelectorAll('span')).find((s) =>
    /^\d{2}:\d{2}$/.test(s.textContent ?? ''),
  );
  if (!horario) throw new Error('horário do balão não renderizou');
  const linha = horario.parentElement;
  if (!linha) throw new Error('linha de status sem elemento pai');

  // A superfície é o ancestral mais próximo que pinta o balão (bg-primary / bg-muted).
  let superficie: Element | null = linha;
  let fundo: string | null = null;
  while (superficie && fundo === null) {
    try {
      fundo = fundoDaClasse(superficie.className);
    } catch {
      superficie = superficie.parentElement;
    }
  }
  if (fundo === null) throw new Error('superfície do balão (bg-primary/bg-muted) não encontrada');

  const { token, alfa } = textoDaClasse(linha.className);
  const medicao: Medicao = { texto: token, fundo, alfa };
  unmount();
  return medicao;
}

describe('#184 — a linha de status do balão fecha a régua AA nos quatro temas', () => {
  const enviado = medirBalão(true);
  const recebido = medirBalão(false);

  it('a linha de status do balão enviado pinta --primary-foreground sobre --primary', () => {
    expect(enviado).toEqual({ texto: 'primary-foreground', fundo: 'primary', alfa: 1 });
  });

  it('a linha de status do balão recebido pinta --muted-foreground sobre --muted', () => {
    expect(recebido).toEqual({ texto: 'muted-foreground', fundo: 'muted', alfa: 1 });
  });

  for (const [nome, tokens] of ESTADOS) {
    const piso = nome === 'alto contraste escuro' ? RESIDUO_TEMA_HC_ESCURO : LIMIAR_TEXTO;

    it(`${nome}: horário do balão RECEBIDO fecha 4,5:1 sobre bg-muted`, () => {
      const fundo = tokens[recebido.fundo];
      const tinta = compor(fundo, tokens[recebido.texto], recebido.alfa);
      expect(razao(tinta, fundo), `muted-foreground/${recebido.alfa * 100} sobre bg-muted`).toBeGreaterThanOrEqual(
        LIMIAR_TEXTO,
      );
    });

    it(`${nome}: horário do balão ENVIADO fecha o piso do estado`, () => {
      const fundo = tokens[enviado.fundo];
      const tinta = compor(fundo, tokens[enviado.texto], enviado.alfa);
      expect(
        razao(tinta, fundo),
        `primary-foreground/${enviado.alfa * 100} sobre bg-primary`,
      ).toBeGreaterThanOrEqual(piso);
    });
  }
});
