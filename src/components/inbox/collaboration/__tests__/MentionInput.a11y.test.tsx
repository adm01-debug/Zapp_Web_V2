import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MentionInput } from '../MentionInput';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: [],
      isLoading: false,
      isError: false,
    })),
  };
});

const { useQuery } = await import('@tanstack/react-query');

describe('MentionInput — acessibilidade do botão ícone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enviar comentário com menção tem aria-label acessível', () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<MentionInput value="@" onChange={vi.fn()} onSubmit={vi.fn()} />);
    const enviar = screen.getByRole('button', { name: /enviar comentário com menção/i });
    expect(enviar).toBeInTheDocument();
  });

  it('botão de enviar tem nome acessível — sem violações axe button-name', async () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], isLoading: false, isError: false });
    const { container } = render(<MentionInput value="@" onChange={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: /enviar comentário com menção/i })).toBeInTheDocument();

    const results = await axe(container);
    const buttonNameViolations = results.violations.filter(v => v.id === 'button-name');
    expect(buttonNameViolations).toHaveLength(0);
  });
});