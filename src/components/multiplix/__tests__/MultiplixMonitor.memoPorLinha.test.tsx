/**
 * F87 (plano MULTIPLIX, Bloco I — Front) — "render isolado por linha (memo)".
 *
 * O monitor re-renderiza a cada interação local (abrir/fechar os AlertDialog de
 * pausar/cancelar) e a cada atualização de dados: o canal realtime debounced
 * invalida `multiplix-dispatch`/`multiplix-recipients` e a contagem de pulados
 * (empresa sem WhatsApp) refaz a leitura a cada 5 s. As linhas eram o JSX inline
 * do `recipients.map(...)`: sem componente de linha + `React.memo`, TODA a lista
 * carregada re-renderiza em cada um desses eventos (a lista pagina em blocos de
 * 500 — "500 de 1.500" no rótulo de amostra).
 *
 * COMO A PROVA MEDE: `StatusPill` é o componente que a LINHA usa (status do
 * DESTINATÁRIO: `failed`/`sent`). O cabeçalho do disparo usa o mesmo componente
 * com o status do DISPARO (`sending`), então a contagem por status isola as
 * linhas. O número medido vem do re-render real do React — não é soma do teste.
 *  1. re-render da tela SEM tocar nos dados (abrir e fechar o AlertDialog de
 *     cancelamento) -> 0 linha re-renderizada;
 *  2. troca do dado de UMA linha, com as outras duas nos MESMOS objetos -> só
 *     ela re-renderiza.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  // status do destinatario, na ordem em que cada linha re-renderizou
  pills: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // A tela abre um canal realtime; o encadeamento e o mesmo do componente.
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Roda o modulo REAL (IconTile, fmtInt, fmtDateTime continuam os de producao) e
// troca so o StatusPill pelo contador — o resto da linha nao e simulado.
vi.mock('@/components/talkx/talkxShared', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/talkx/talkxShared')>();
  return {
    ...real,
    StatusPill: ({ status }: { status: string }) => {
      h.pills.push(status);
      return <span data-testid="status-pill">{status}</span>;
    },
  };
});

// Roda o modulo REAL e troca so os quatro acessos de dados que o monitor usa.
// Listar export por export deixava o mock obsoleto a cada hook novo da mesma
// trilha: o `useConfirmMultiplixDispatch` do F51 (ponta da dia) entrou no
// `MultiplixMonitor` e o mock enumerado passou a devolver `undefined` para ele,
// quebrando a prova com "No export is defined on the mock".
vi.mock('@/hooks/integrations/useMultiplixDispatches', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/integrations/useMultiplixDispatches')>();
  return {
    ...real,
    useMultiplixDispatch: () => ({
      data: {
        id: 'd1', name: 'Disparo F87', message_template: 'oi', status: 'sending',
        total_recipients: 3, sent_count: 1, failed_count: 0, delivered_count: 0,
        outcome_unknown_count: 0, started_at: null, paused_at: null, pause_reason: null,
        completed_at: null, created_at: '2026-10-06T10:00:00Z',
      },
    }),
    useMultiplixRecipients: () => ({
      data: { rows: h.rows, total: 3, truncated: false },
      isError: false,
      error: null,
    }),
    useMultiplixDispatchAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
    // Nunca resolve: a contagem de pulados nao chega depois da montagem, entao a
    // regua zerada no teste so mede os re-renders que o teste provoca.
    fetchMultiplixRecipientsTotal: () => new Promise<number>(() => {}),
  };
});

import { MultiplixMonitor } from '@/components/multiplix/MultiplixMonitor';

function recipientRow(id: string, status: string) {
  return {
    id,
    company_name_snapshot: `Empresa ${id}`,
    destino_e164: '+551****0000',
    status,
    sent_at: null,
    error_message: null,
    personalized_message: null,
  };
}

function contagem(status: string) {
  return h.pills.filter((s) => s === status).length;
}

/** Deixa as atualizacoes de estado do React assentarem antes de medir. */
async function flush() {
  await act(async () => { await Promise.resolve(); });
}

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.pills = [];
  h.rows = [];
});

describe('MultiplixMonitor — render isolado por linha (F87)', () => {
  it('re-render da tela sem mudar as linhas nao re-renderiza nenhuma linha', async () => {
    h.rows = [recipientRow('a', 'failed'), recipientRow('b', 'failed'), recipientRow('c', 'failed')];
    renderMonitor();
    await screen.findByText('Empresa b');
    await flush();
    h.pills = []; // regua zerada depois da montagem

    // Duas re-renderizacoes da tela SEM tocar nos dados: abrir e fechar o
    // AlertDialog de cancelamento (estado local do monitor).
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await flush();

    expect(contagem('failed')).toBe(0);
  });

  it('mudanca no dado de uma linha re-renderiza so ela', async () => {
    const b = recipientRow('b', 'failed');
    const c = recipientRow('c', 'failed');
    h.rows = [recipientRow('a', 'failed'), b, c];
    renderMonitor();
    await screen.findByText('Empresa b');
    await flush();
    h.pills = [];

    // 'b' e 'c' continuam os MESMOS objetos; so 'a' troca (failed -> sent).
    h.rows = [recipientRow('a', 'sent'), b, c];
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await flush();

    expect(contagem('failed')).toBe(0); // b e c intactas
    expect(contagem('sent')).toBe(1); // so a linha 'a'
    // e o re-render da linha 'a' chegou na tela (nao e so contador). A primeira
    // pilula e a do cabecalho do disparo (status do DISPARO, 'sending').
    const pills = screen.getAllByTestId('status-pill').map((el) => el.textContent);
    expect(pills).toEqual(['sending', 'sent', 'failed', 'failed']);
  });
});
