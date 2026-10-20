/**
 * Sussurro — destino do envio e tratamento de falha.
 *
 * Prova que o INSERT de `whisper_messages` leva o destinatário certo (o
 * responsável atual da conversa por padrão, ou o escolhido no seletor), que
 * sem destino válido o envio não sai, e que uma falha do banco mantém o texto
 * no campo, avisa o motivo e permite tentar de novo. Prova também que, com
 * "reduzir movimento", o painel e o seletor aparecem sem nada se deslocar.
 */
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WhisperMode } from '../WhisperMode';

type MotionDivProps = ComponentProps<'div'> & {
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  variants?: unknown;
  transition?: unknown;
};

const h = vi.hoisted(() => {
  const makeChain = () => {
    const result = { data: [], error: null };
    const c: Record<string, unknown> = {
      select: () => c,
      eq: () => c,
      order: () => c,
      limit: () => c,
      in: () => c,
      not: () => c,
      is: () => c,
      range: () => c,
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return c;
  };

  const insertMock = vi.fn();
  const supabase = {
    from: vi.fn(() => ({ ...makeChain(), insert: insertMock })),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  };

  return {
    reduzido: false,
    insertMock,
    supabase,
    agents: [] as Array<Record<string, unknown>>,
    isLoadingAgents: false,
  };
});

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => h.reduzido,
  motion: {
    ...(await importOriginal<typeof import('framer-motion')>()).motion,
    div: ({ children, initial, animate, exit, variants, transition: _transition, ...props }: MotionDivProps) => (
      <div
        data-motion-initial={JSON.stringify(initial ?? null)}
        data-motion-animate={JSON.stringify(animate ?? null)}
        data-motion-exit={JSON.stringify(exit ?? null)}
        data-motion-variants={JSON.stringify(variants ?? null)}
        {...props}
      >
        {children}
      </div>
    ),
  },
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div role="tooltip">{children}</div>,
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'sup-1', role: 'supervisor', name: 'Supervisor Teste' } }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: h.agents, isLoading: h.isLoadingAgents, error: null, refetch: vi.fn() }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [], isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

function agente(id: string, name: string, status = 'online') {
  return { id, user_id: `u-${id}`, name, email: null, avatar_url: null, role: 'agent', job_title: null, department: null, phone: null, is_active: true, max_chats: null, created_at: '', updated_at: '', activeChats: 2, status, queues: [] };
}

/** Abre o painel do sussurro (o único botão com "sussurro" antes de abrir). */
function abrirSussurro() {
  fireEvent.click(screen.getByRole('button', { name: /sussurro/i }));
}

beforeEach(() => {
  h.reduzido = false;
  h.agents = [agente('a1', 'Ana'), agente('u-2', 'Bruno', 'away')];
  h.isLoadingAgents = false;
  h.insertMock.mockReset();
  h.insertMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
});

describe('WhisperMode — destino e falha do sussurro', () => {
  it('(1) envia para o responsável atual da conversa e limpa o campo no sucesso', async () => {
    render(<WhisperMode contactId="c1" targetAgentId="a1" />);
    abrirSussurro();

    fireEvent.change(screen.getByLabelText('Mensagem do sussurro'), { target: { value: 'Cuidado com o tom' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar sussurro/i }));

    await waitFor(() => expect(h.insertMock).toHaveBeenCalledTimes(1));
    expect(h.insertMock).toHaveBeenCalledWith({
      contact_id: 'c1',
      sender_id: 'sup-1',
      target_agent_id: 'a1',
      content: 'Cuidado com o tom',
    });
    await waitFor(() => expect(screen.getByLabelText('Mensagem do sussurro')).toHaveValue(''));
  });

  it('(2) escolher outro atendente no seletor muda o alvo do envio', async () => {
    render(<WhisperMode contactId="c1" targetAgentId="a1" />);
    abrirSussurro();

    fireEvent.click(screen.getByRole('button', { name: /destinatário do sussurro: ana/i }));
    fireEvent.click(await screen.findByRole('button', { name: /bruno/i }));

    fireEvent.change(screen.getByLabelText('Mensagem do sussurro'), { target: { value: 'Pode assumir?' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar sussurro/i }));

    await waitFor(() => expect(h.insertMock).toHaveBeenCalledTimes(1));
    expect(h.insertMock).toHaveBeenCalledWith(expect.objectContaining({ target_agent_id: 'u-2' }));
  });

  it('(3) sem destino válido o envio fica desabilitado e não chama o banco', () => {
    h.agents = [];
    render(<WhisperMode contactId="c1" />);
    abrirSussurro();

    fireEvent.change(screen.getByLabelText('Mensagem do sussurro'), { target: { value: 'Alguém me ajuda?' } });
    const enviar = screen.getByRole('button', { name: /enviar sussurro/i });

    expect(enviar).toBeDisabled();
    fireEvent.click(enviar);
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it('(4) falha do banco mantém o texto, explica o motivo e deixa tentar de novo', async () => {
    h.insertMock.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    render(<WhisperMode contactId="c1" targetAgentId="a1" />);
    abrirSussurro();

    fireEvent.change(screen.getByLabelText('Mensagem do sussurro'), { target: { value: 'Mensagem que não sai' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar sussurro/i }));

    const faixa = await screen.findByTestId('sussurro-erro');
    expect(faixa).toHaveTextContent(/sem permissão/i);
    expect(screen.getByLabelText('Mensagem do sussurro')).toHaveValue('Mensagem que não sai');

    // Tentar de novo reaproveita o texto preservado e agora dá certo.
    h.insertMock.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));

    await waitFor(() => expect(h.insertMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText('Mensagem do sussurro')).toHaveValue(''));
    expect(screen.queryByTestId('sussurro-erro')).toBeNull();
  });

  it('(5) com reduzir movimento o painel e o seletor aparecem sem nada se deslocar', async () => {
    h.reduzido = true;
    render(<WhisperMode contactId="c1" targetAgentId="a1" />);
    abrirSussurro();

    const painel = screen.getByTestId('sussurro-painel');
    expect(painel.style.height).toBe(''); // sem altura para animar

    fireEvent.click(screen.getByRole('button', { name: /destinatário do sussurro: ana/i }));
    const lista = await screen.findByTestId('sussurro-destino-lista');
    expect(lista.style.transform).toBe(''); // nada se desloca; só cor/opacidade
    expect(lista.style.height).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /bruno/i }));
    expect(screen.getByRole('button', { name: /destinatário do sussurro: bruno/i })).toBeInTheDocument();
  });

  it('(6) Enter durante envio em andamento não dispara INSERT duplicado', async () => {
    let resolverEnvio: (value: { error: null }) => void = () => undefined;
    h.insertMock.mockReturnValue(new Promise((resolve) => { resolverEnvio = resolve; }));
    render(<WhisperMode contactId="c1" targetAgentId="a1" />);
    abrirSussurro();

    const input = screen.getByLabelText('Mensagem do sussurro');
    fireEvent.change(input, { target: { value: 'Uma vez só' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar sussurro/i }));

    await waitFor(() => expect(h.insertMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('sussurro-enviando')).toBeInTheDocument());
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(h.insertMock).toHaveBeenCalledTimes(1);

    resolverEnvio({ error: null });
    await waitFor(() => expect(screen.getByTestId('sussurro-enviado-ok')).toBeInTheDocument());
  });

  it('(7) teclado do seletor abre, navega, escolhe, fecha com Esc focando o gatilho e fecha com Tab', async () => {
    render(<WhisperMode contactId="c1" targetAgentId="a1" />);
    abrirSussurro();

    let gatilho = screen.getByRole('button', { name: /destinatário do sussurro: ana/i });
    fireEvent.keyDown(gatilho, { key: 'ArrowDown', code: 'ArrowDown' });
    let lista = await screen.findByTestId('sussurro-destino-lista');
    expect(within(lista).getByRole('button', { name: /ana/i })).toHaveFocus();

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(within(lista).getByRole('button', { name: /bruno/i })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp', code: 'ArrowUp' });
    expect(within(lista).getByRole('button', { name: /ana/i })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'Enter', code: 'Enter' });

    gatilho = screen.getByRole('button', { name: /destinatário do sussurro: bruno/i });
    expect(gatilho).toHaveFocus();
    expect(screen.queryByTestId('sussurro-destino-lista')).toBeNull();

    fireEvent.keyDown(gatilho, { key: 'ArrowDown', code: 'ArrowDown' });
    await screen.findByTestId('sussurro-destino-lista');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByTestId('sussurro-destino-lista')).toBeNull();
    expect(gatilho).toHaveFocus();

    fireEvent.keyDown(gatilho, { key: 'ArrowDown', code: 'ArrowDown' });
    lista = await screen.findByTestId('sussurro-destino-lista');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Tab', code: 'Tab' });
    expect(screen.queryByTestId('sussurro-destino-lista')).toBeNull();
  });

  it('(8) mostra vazio, carregando e tooltip quando não há destinatário válido', async () => {
    h.agents = [];
    render(<WhisperMode contactId="c1" />);
    abrirSussurro();

    expect(screen.getByRole('tooltip')).toHaveTextContent(/escolha um destinatário/i);
    fireEvent.click(screen.getByRole('button', { name: /escolher destinatário do sussurro/i }));
    expect(await screen.findByText(/nenhum atendente disponível/i)).toBeInTheDocument();
    cleanup();

    h.isLoadingAgents = true;
    render(<WhisperMode contactId="c1" />);
    abrirSussurro();
    fireEvent.click(screen.getByRole('button', { name: /escolher destinatário do sussurro/i }));
    expect(await screen.findByTestId('sussurro-destino-carregando')).toBeInTheDocument();
  });

  it('(9) painel com movimento não anima altura, chevron reduzido não gira e faixa reduzida não desloca', async () => {
    render(<WhisperMode contactId="c1" targetAgentId="a1" />);
    abrirSussurro();
    const painel = screen.getByTestId('sussurro-painel');
    expect(painel.getAttribute('data-motion-initial')).not.toContain('height');
    expect(painel.getAttribute('data-motion-animate')).not.toContain('height');
    cleanup();

    h.reduzido = true;
    h.insertMock.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    render(<WhisperMode contactId="c1" targetAgentId="a1" />);
    abrirSussurro();
    fireEvent.click(screen.getByRole('button', { name: /destinatário do sussurro: ana/i }));
    expect(screen.getByTestId('sussurro-destino-chevron')).not.toHaveClass('rotate-180');

    fireEvent.change(screen.getByLabelText('Mensagem do sussurro'), { target: { value: 'Mensagem que falha' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar sussurro/i }));
    const faixa = await screen.findByTestId('sussurro-erro');
    expect(JSON.parse(faixa.getAttribute('data-motion-initial') ?? '{}')).not.toHaveProperty('y');
  });

  it('(10) recarga da lista aberta não rouba foco de outro controle do painel', async () => {
    const { rerender } = render(<WhisperMode contactId="c1" targetAgentId="a1" />);
    abrirSussurro();
    fireEvent.click(screen.getByRole('button', { name: /destinatário do sussurro: ana/i }));
    await screen.findByTestId('sussurro-destino-lista');

    const input = screen.getByLabelText('Mensagem do sussurro');
    input.focus();
    expect(input).toHaveFocus();

    h.agents = [agente('a1', 'Ana Atualizada'), agente('u-2', 'Bruno', 'away')];
    rerender(<WhisperMode contactId="c1" targetAgentId="a1" />);
    expect(input).toHaveFocus();
  });
});
