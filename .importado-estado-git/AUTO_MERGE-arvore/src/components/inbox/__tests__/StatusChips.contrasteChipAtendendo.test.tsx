/**
 * Y18-7 / A11Y-CONFIG_ADMIN_SHELL-09 — contraste do chip de status ATIVO no alto contraste.
 *
 * O defeito medido no Chromium real (axe, auditoria de 07/10/2026, achado 09): o chip
 * `status-chip-attending` ATIVO pinta `bg-accent` (fundo) com `text-foreground` (texto). No
 * alto contraste CLARO o acento vira o violeta sólido `--accent` (258 100% 45%) e o
 * `--foreground` é preto — o par fecha 2,40:1 (`#000000` sobre `#4500e6`), abaixo do piso AA
 * de 4,5:1 para texto pequeno (`text-xs`/`text-2xs`). É o único ponto em que o modo de
 * acessibilidade PIORA o contraste.
 *
 * ── O que este teste prova (mesmo medidor WCAG do #184/MessageBubble.contrasteStatus) ──
 *  1. renderiza o `StatusChips` REAL e lê as classes que o chip ATIVO de fato recebeu: fundo
 *     e texto saem daí, não de um literal do teste;
 *  2. resolve os tokens dos 4 temas de `tokens.css` + `accessibility.css` — inclusive a regra
 *     do tema de alto contraste que troca a tinta do chip quando o texto padrão não fecha AA;
 *  3. mede a razão WCAG do par efetivo em claro, escuro, alto contraste e escuro+alto contraste.
 *
 * Medido antes da correção: alto contraste CLARO 2,40:1 (abaixo de AA). Depois: 8,77:1.
 * Os outros três temas não mudam: no escuro as duas tintas valem o mesmo (branco) e no alto
 * contraste ESCURO o `text-foreground` já é branco (4,71:1).
 */
import { readFileSync } from 'node:fs';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusChips } from '../conversation-list/StatusChips';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

// O contador do chip é do `profile.id`, não do auth id (#349) — o perfil logado é o único
// com a conversa atribuída, então "Em atendimento" fica com 1.
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-1' }, profile: { id: 'perfil-1' } }),
}));

// ─── WCAG 2.1: HSL (formato dos tokens) → sRGB → razão de contraste ─────────

type Rgb = [number, number, number];

function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

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

const LIMIAR_TEXTO = 4.5;

// ─── A tinta do chip no alto contraste CLARO vem do TEMA ────────────────────
/**
 * No alto contraste CLARO a tinta do chip sai de uma regra do tema de acessibilidade — o token
 * vem DAÍ (código de produção), não de um literal. `null` = a regra não existe, que é o estado
 * do defeito: o chip volta a pintar `text-foreground` (preto sobre violeta, 2,40:1).
 */
function tokenDoChipNoAltoContrasteClaro(css: string): string | null {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const regra = limpo.match(/([^{}]*\.status-chip-active[^{}]*)\{([^}]*)\}/);
  if (!regra) return null;
  const [, seletor, declaracoes] = regra;
  if (!/\.high-contrast/.test(seletor) || !/:not\(\.dark\)/.test(seletor)) return null;
  const cor = declaracoes.match(/color:\s*hsl\(var\(--([a-z0-9-]+)\)\)/);
  return cor ? cor[1] : null;
}

const TINTA_CHIP_HC_CLARO = tokenDoChipNoAltoContrasteClaro(A11Y);

// ─── Classes REAIS do chip ativo → token do tema ────────────────────────────

/**
 * Tokens que a lista de classes de fato resolve, para um tipo (`bg-`/`text-`). `text-xs` (e
 * qualquer outro utilitário) não é token de cor e cai fora porque não existe em `tokens.css`.
 */
function tokensDaClasse(className: string, tipo: 'bg' | 'text', vars: Record<string, Rgb>): string[] {
  const achados: string[] = [];
  for (const classe of className.split(/\s+/)) {
    const m = classe.match(new RegExp(`^${tipo}-([a-z0-9-]+)(?:/\\d+)?$`));
    if (m && vars[m[1]] !== undefined) achados.push(m[1]);
  }
  return achados;
}

const conversations: ConversationWithMessages[] = [
  {
    contact: { id: 'c1', assigned_to: 'perfil-1' } as ConversationWithMessages['contact'],
    messages: [{ id: 'm1' } as never],
    unreadCount: 0,
    lastMessage: null,
  },
];

/** Renderiza o `StatusChips` REAL com o chip "Em atendimento" ATIVO e devolve o par fundo×texto. */
function medirChipAtendendo(): { fundo: string; base: string } {
  cleanup();
  render(<StatusChips conversations={conversations} chipTab="attending" onChipTabChange={() => {}} />);
  const chip = screen.getByTestId('status-chip-attending');
  expect(chip, 'o chip ativo é o que o cartão audita').toHaveClass('status-chip-active');
  const fundos = tokensDaClasse(chip.className, 'bg', CLARO);
  const tintas = tokensDaClasse(chip.className, 'text', CLARO);
  expect(fundos).toHaveLength(1);
  expect(tintas).toHaveLength(1);
  return { fundo: fundos[0], base: tintas[0] };
}

describe('Y18-7 — o chip de status ATIVO fecha a régua AA nos quatro temas', () => {
  afterEach(() => cleanup());

  it('o chip ATIVO pinta o fundo com bg-accent e o texto com text-foreground (o par auditado)', () => {
    expect(medirChipAtendendo()).toEqual({ fundo: 'accent', base: 'foreground' });
  });

  it('o tema de alto contraste troca a tinta do chip no CLARO por um token existente', () => {
    expect(
      TINTA_CHIP_HC_CLARO,
      'regra `.high-contrast:not(.dark) .status-chip-active` ausente em src/styles/accessibility.css',
    ).not.toBeNull();
    expect(CLARO[TINTA_CHIP_HC_CLARO!], `--${TINTA_CHIP_HC_CLARO} não existe em tokens.css`).toBeDefined();
  });

  for (const [nome, tokens] of ESTADOS) {
    it(`${nome}: o rótulo do chip fecha ≥4,5:1`, () => {
      const { fundo, base } = medirChipAtendendo();
      const tinta = nome === 'alto contraste' && TINTA_CHIP_HC_CLARO ? TINTA_CHIP_HC_CLARO : base;
      expect(
        razao(tokens[tinta], tokens[fundo]),
        `${nome}: ${tinta} sobre ${fundo}`,
      ).toBeGreaterThanOrEqual(LIMIAR_TEXTO);
    });
  }

  it('a tabela medida (claro, escuro, alto contraste, alto contraste escuro)', () => {
    const { fundo, base } = medirChipAtendendo();
    const medido = ESTADOS.map(([nome, tokens]) => {
      const tinta = nome === 'alto contraste' && TINTA_CHIP_HC_CLARO ? TINTA_CHIP_HC_CLARO : base;
      return Number(razao(tokens[tinta], tokens[fundo]).toFixed(2));
    });
    // Antes da correção o 3º valor era 2,40 (o defeito da auditoria). Se um token mudar de
    // valor, esta tabela falha DE PROPÓSITO: a medida precisa ser refeita.
    expect(medido).toEqual([14.91, 14.22, 8.77, 4.71]);
  });
});
