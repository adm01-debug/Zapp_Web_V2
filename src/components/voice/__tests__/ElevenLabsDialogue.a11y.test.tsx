import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent } from '@testing-library/react';
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

import { ElevenLabsDialogue } from '../ElevenLabsDialogue';

describe('ElevenLabsDialogue — acessibilidade', () => {
  it('combobox de voz tem aria-label "Voz"', () => {
    render(<ElevenLabsDialogue />);
    const triggers = screen.getAllByRole('combobox', { name: 'Voz' });
    expect(triggers.length).toBeGreaterThanOrEqual(1);
  });

  it('botão remover fala tem aria-label "Remover fala N" quando há mais de 2 linhas', () => {
    const { container } = render(<ElevenLabsDialogue />);
    fireEvent.click(screen.getByText('Adicionar Fala'));
    const botoes = container.querySelectorAll('button');
    const botaoRemover = Array.from(botoes).find(
      btn => btn.getAttribute('aria-label')?.startsWith('Remover fala')
    );
    expect(botaoRemover).toBeInTheDocument();
  });

  it('axe não encontra violações', async () => {
    const { container } = render(<ElevenLabsDialogue />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});