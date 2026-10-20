import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GmailWebhookMonitor } from '../GmailWebhookMonitor';

// R2-API-059 — GmailWebhookMonitor.
// Antes: `loadData` descartava o error das três respostas e aplicava `data || []` /
// `count || 0`; o catch não via esses erros normais do SDK. Uma indisponibilidade
// aparecia como "0 contas / 0 threads / nenhuma conta conectada".

interface QueryResult {
  data?: unknown;
  count?: number | null;
  error: { message: string } | null;
}

const state: { rpc: QueryResult; from: QueryResult[] } = {
  rpc: { data: [], error: null },
  from: [],
};

function makeChain(result: QueryResult): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://projeto.supabase.co',
  supabase: {
    rpc: () => Promise.resolve(state.rpc),
    from: () => makeChain(state.from.shift() ?? { data: null, count: 0, error: null }),
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: () => {}, info: () => {}, error: () => {}, debug: () => {} }),
}));

const account = {
  id: 'acc1',
  email_address: 'contato@promobrindes.com.br',
  is_active: true,
  sync_status: 'synced',
  last_sync_at: null,
  last_error: null,
  created_at: '2026-10-01T00:00:00Z',
};

function fixtureValida() {
  state.rpc = { data: [account], error: null };
  state.from = [
    { data: null, count: 12, error: null },
    { data: null, count: 4, error: null },
  ];
}

function tresErros() {
  state.rpc = { data: null, error: { message: 'permission denied for function get_own_gmail_accounts' } };
  state.from = [
    { data: null, count: null, error: { message: 'permission denied for table email_threads' } },
    { data: null, count: null, error: { message: 'canceling statement due to statement timeout' } },
  ];
}

describe('GmailWebhookMonitor — falha de consulta (R2-API-059)', () => {
  beforeEach(() => {
    fixtureValida();
  });

  it('fixture válida: mostra a conta, as contagens reais e nenhum aviso de erro', async () => {
    render(<GmailWebhookMonitor />);
    expect(await screen.findByText('contato@promobrindes.com.br')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/desatualizado/)).not.toBeInTheDocument();
  });

  it('fixture válida seguida das três consultas com erro: mostra recuperação, preserva o último dado bom e não alega ausência', async () => {
    render(<GmailWebhookMonitor />);
    await screen.findByText('contato@promobrindes.com.br');

    tresErros();
    fireEvent.click(screen.getByRole('button', { name: /atualizar/i }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível consultar os dados do Gmail');

    // Último dado bom preservado: erro não sobrescreve contagem com zero.
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('contato@promobrindes.com.br')).toBeInTheDocument();
    expect(screen.getAllByText(/desatualizado/).length).toBeGreaterThan(0);

    // E não afirma ausência real de conta.
    expect(screen.queryByText(/Nenhuma conta Gmail conectada/)).not.toBeInTheDocument();

    // Recuperação explícita continua disponível depois da tentativa.
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('primeira carga falhando: campos aparecem como desconhecidos (—), sem contagem zero falsa', async () => {
    tresErros();
    render(<GmailWebhookMonitor />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Nenhum dado foi carregado ainda/)).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma conta Gmail conectada/)).not.toBeInTheDocument();
    expect(screen.getByText(/Status das contas indisponível/)).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('falha só na contagem não publica as contas: o resultado das três consultas é atômico', async () => {
    state.rpc = { data: [account], error: null };
    state.from = [
      { data: null, count: null, error: { message: 'permission denied for table email_threads' } },
      { data: null, count: 4, error: null },
    ];
    render(<GmailWebhookMonitor />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('contato@promobrindes.com.br')).not.toBeInTheDocument();
    expect(screen.getByText(/Status das contas indisponível/)).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('zero real da consulta bem-sucedida continua sendo zero (não vira "desconhecido")', async () => {
    state.rpc = { data: [], error: null };
    state.from = [
      { data: null, count: 0, error: null },
      { data: null, count: 0, error: null },
    ];
    render(<GmailWebhookMonitor />);

    expect(await screen.findByText('Nenhuma conta Gmail conectada. Configure em Integrações → Gmail.')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(4);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
