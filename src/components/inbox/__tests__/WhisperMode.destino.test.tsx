/**
 * Sussurro — destino do envio e tratamento de falha.
 *
 * Prova que o INSERT de `whisper_messages` leva o destinatário certo (o
 * responsável atual da conversa por padrão, ou o escolhido no seletor), que
 * sem destino válido o envio não sai, e que uma falha do banco mantém o texto
 * no campo, avisa o motivo e permite tentar de novo. Prova também que, com
 * "reduzir movimento", o painel e o seletor aparecem sem nada se deslocar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WhisperMode } from '../WhisperMode';

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
  };
});

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => h.reduzido,
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'sup-1', role: 'supervisor', name: 'Supervisor Teste' } }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: h.agents, isLoading: false, error: null, refetch: vi.fn() }),
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
});
