import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
  AuthProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock('@/hooks/gamification/useAgentGamification', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/gamification/useAgentGamification')>(
    '@/hooks/gamification/useAgentGamification',
  );
  return {
    ...actual,
    useAgentGamification: () => ({
      achievements: [],
      stats: { level: 2, xp: 200 },
      isLoading: false,
      isError: false,
    }),
  };
});

import { AchievementsStatsHeader, AchievementsHeaderBadges } from '../AchievementsStats';
import { AchievementsSystem } from '../AchievementsSystem';
import { SpeedTypingGame } from '../MiniGameDialogs';
import { QuizGame } from '../MiniGameDialogs';

function renderizarComQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const conquistasMock = [
  {
    id: 'a1',
    profile_id: 'p1',
    achievement_type: 'fast_response',
    achievement_name: 'Resposta Relâmpago',
    achievement_description: 'Respondeu em menos de 1 minuto',
    xp_earned: 50,
    earned_at: '2026-10-05T12:00:00.000Z',
  },
];

describe('Acessibilidade — barras de progresso das Conquistas', () => {
  it('progress bar de nível tem aria-label com o nome do nível', () => {
    renderizarComQueryClient(
      <AchievementsStatsHeader
        achievements={conquistasMock}
        stats={{ level: 3, xp: 300 }}
      />,
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-label', 'Progresso para o nível 4');
  });

  it('progress bar do modo compacto (AchievementsSystem) tem aria-label com o nível', () => {
    renderizarComQueryClient(<AchievementsSystem showCompact />);

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-label', 'Progresso para o nível 3');
  });
});

describe('Acessibilidade — mini-games', () => {
  it('barra de precisão do Speed Typing tem aria-label', () => {
    renderizarComQueryClient(<SpeedTypingGame isOpen onClose={() => {}} onComplete={() => {}} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Precisão de digitação');
  });

  it('barra de progresso do Quiz tem aria-label', () => {
    renderizarComQueryClient(<QuizGame isOpen onClose={() => {}} onComplete={() => {}} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Progresso do quiz');
  });
});

type RGB = [number, number, number];
function parseHsl(s: string): RGB {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/)!;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}
function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function luminancia(rgb: RGB): number {
  const partes = [rgb[0], rgb[1], rgb[2]].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * partes[0] + 0.7152 * partes[1] + 0.0722 * partes[2];
}
const compor = (cor: string, alfa: number, base: string): RGB => {
  const rgb = hslToRgb(...parseHsl(cor));
  const brgb = hslToRgb(...parseHsl(base));
  return [rgb[0] * alfa + brgb[0] * (1 - alfa), rgb[1] * alfa + brgb[1] * (1 - alfa), rgb[2] * alfa + brgb[2] * (1 - alfa)];
};
const razaoRgb = (a: RGB, b: RGB): number => {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const razaoNaTinta = (texto: string, tinta: string, alfa: number, card: string) =>
  razaoRgb(compor(texto, 1, card), compor(tinta, alfa, card));

function variaveis(css: string, cabecalho: string): Record<string, string> {
  const idx = css.indexOf(cabecalho);
  if (idx === -1) return {};
  const abre = css.indexOf('{', idx);
  let profundidade = 1;
  let i = abre + 1;
  while (profundidade > 0 && i < css.length) {
    if (css[i] === '{') profundidade++;
    else if (css[i] === '}') profundidade--;
    i++;
  }
  const vars: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  const bloco = css.slice(abre + 1, i - 1);
  while ((m = re.exec(bloco))) vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  return vars;
}

describe('Acessibilidade — selo de XP', () => {
  it('selo usa o par de texto do XP (nao text-xp puro nem primary-text)', () => {
    const { container } = renderizarComQueryClient(
      <AchievementsHeaderBadges stats={{ level: 3, xp: 300 }} />,
    );
    const selo = container.querySelector('.bg-xp\\/10');
    expect(selo).not.toBeNull();
    expect(selo!.className).toContain('text-[hsl(var(--xp-text))]');
    expect(selo!.className).not.toMatch(/(^|\s)text-xp(\s|$)/);
  });

  it('par --xp-text sobre bg-xp/10 fecha AA (4,5:1) no claro e no escuro', () => {
    const tokens = fs.readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
    const claro = variaveis(tokens, ':root {');
    const escuro = { ...claro, ...variaveis(tokens, '.dark {') };
    expect(claro['xp-text']).toBeTruthy();
    expect(escuro['xp-text']).toBeTruthy();
    expect(razaoNaTinta(claro['xp-text'], claro.xp, 0.1, claro.card)).toBeGreaterThanOrEqual(4.5);
    expect(razaoNaTinta(escuro['xp-text'], escuro.xp, 0.1, escuro.card)).toBeGreaterThanOrEqual(4.5);
  });
});
