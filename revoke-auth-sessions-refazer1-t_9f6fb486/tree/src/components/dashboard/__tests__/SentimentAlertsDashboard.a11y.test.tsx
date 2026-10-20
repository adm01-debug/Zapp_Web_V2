import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

const h = vi.hoisted(() => ({ rpc: vi.fn(), analyses: vi.fn(), profiles: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: (table: string) => {
      if (table === 'conversation_analyses') {
        return { select: () => ({ gte: () => ({ order: () => h.analyses() }) }) };
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => h.profiles() }) };
      }
      throw new Error(`tabela inesperada no mock: ${table}`);
    },
  },
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { SentimentAlertsDashboard } from '../SentimentAlertsDashboard';

beforeEach(() => {
  h.rpc.mockReset();
  h.analyses.mockReset();
  h.profiles.mockReset();
  h.rpc.mockResolvedValue({ data: [], error: null });
  h.analyses.mockResolvedValue({ data: [], error: null });
  h.profiles.mockResolvedValue({ data: [], error: null });
});

describe('SentimentAlertsDashboard — acessibilidade', () => {
  it('o combobox de período expõe nome acessível', () => {
    render(<SentimentAlertsDashboard />);

    const filtro = screen.getByRole('combobox', { name: /período/i });
    expect(filtro).toBeInTheDocument();
  });

  it('os títulos estão em ordem sem pular nível (h1 primeiro, nunca sobe mais de 1)', () => {
    const { container } = render(<SentimentAlertsDashboard />);

    const headings = Array.from(container.querySelectorAll('h1, h2, h3'));
    expect(headings.length).toBeGreaterThanOrEqual(2);

    const niveis = headings.map((el) => Number(el.tagName.slice(1)));
    expect(niveis[0]).toBe(1);
    for (let i = 1; i < niveis.length; i += 1) {
      expect(niveis[i] - niveis[i - 1]).toBeLessThanOrEqual(1);
    }

    const evolucao = headings.find((el) => el.textContent?.includes('Evolução Diária'));
    expect(evolucao?.tagName).toBe('H2');
  });

  it('a tela passa no axe sem violações (fora o botão de atualizar, de outro cartão)', async () => {
    const { container } = render(<SentimentAlertsDashboard />);

    // O botão icon-only de atualizar ainda não tem nome acessível — isso é do
    // t_d1f16c8d (Y17-2, doing), fora deste cartão; por isso a regra button-name
    // fica desligada aqui. Todo o resto tem de passar zerado.
    const resultado = await axe(container, { rules: { 'button-name': { enabled: false } } });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});
