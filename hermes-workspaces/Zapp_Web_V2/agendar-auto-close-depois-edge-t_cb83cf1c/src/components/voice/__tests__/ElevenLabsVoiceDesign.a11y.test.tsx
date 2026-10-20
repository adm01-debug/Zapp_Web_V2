import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

beforeAll(() => {
  const estilo = document.createElement('style');
  estilo.textContent = '.hidden { display: none; }';
  document.head.appendChild(estilo);
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ElevenLabsVoiceDesign } from '../ElevenLabsVoiceDesign';

describe('ElevenLabsVoiceDesign — acessibilidade', () => {
  it('seletor de gênero tem aria-label "Gênero"', () => {
    render(<ElevenLabsVoiceDesign />);
    expect(screen.getByRole('combobox', { name: 'Gênero' })).toBeInTheDocument();
  });

  it('seletor de idade tem aria-label "Idade"', () => {
    render(<ElevenLabsVoiceDesign />);
    expect(screen.getByRole('combobox', { name: 'Idade' })).toBeInTheDocument();
  });

  it('seletor de sotaque tem aria-label "Sotaque"', () => {
    render(<ElevenLabsVoiceDesign />);
    expect(screen.getByRole('combobox', { name: 'Sotaque' })).toBeInTheDocument();
  });

  it('axe não encontra violações', async () => {
    const { container } = render(<ElevenLabsVoiceDesign />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});