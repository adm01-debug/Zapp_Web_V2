import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { WhisperMode } from '../WhisperMode';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    profile: { id: 'sup-1', role: 'supervisor', name: 'Supervisor Teste' },
  }),
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
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

const { useQuery } = await import('@tanstack/react-query');

describe('WhisperMode — acessibilidade dos botões ícone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recolher tem aria-label acessível', () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<WhisperMode contactId="contact-1" />);
    fireEvent.click(screen.getByRole('button', { name: /sussurro/i }));
    const recolher = screen.getByRole('button', { name: /recolher/i });
    expect(recolher).toBeInTheDocument();
  });

  it('enviar sussurro tem aria-label acessível', () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<WhisperMode contactId="contact-1" targetAgentId="agent-1" />);
    fireEvent.click(screen.getByRole('button', { name: /sussurro/i }));
    const enviar = screen.getByRole('button', { name: /enviar sussurro/i });
    expect(enviar).toBeInTheDocument();
  });

  it('três botões ícone de sussurro têm nome acessível — sem violações axe button-name', async () => {
    (useQuery as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], isLoading: false, isError: false });
    const { container } = render(<WhisperMode contactId="contact-1" targetAgentId="agent-1" />);

    fireEvent.click(screen.getByRole('button', { name: /sussurro/i }));

    expect(screen.getByRole('button', { name: /recolher/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar sussurro/i })).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});