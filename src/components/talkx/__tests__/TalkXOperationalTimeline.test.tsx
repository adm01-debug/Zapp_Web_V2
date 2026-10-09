import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fmtTime } from '../kit/format';

/**
 * X152 — "Linha do Tempo Operacional" lida do servidor.
 *
 * O defeito que este teste trava (estado anterior do Monitor): a linha do tempo
 * escrevia o TIPO CRU do banco quando o evento não tinha mensagem (a palavra "resumed"
 * na tela), mostrava o JSON de `limits_updated`, pintava um ponto colorido só para 4
 * tipos e não tinha "Ver todos" — 50 eventos fixos, sem página seguinte.
 *
 * Casos cobertos:
 * 1. `resumed` com ator vira "Retomada após pausa" e o nome — nunca "resumed";
 * 2. `limits_updated` mostra os valores formatados, sem nenhuma chave do JSON;
 * 3. resposta sem acesso à mensagem fica só com o título, sem trecho;
 * 4. o card mostra 5 itens e "Ver todos" abre o painel com o filtro por tipo;
 * 5. "Carregar mais" pede a SEGUNDA página pelo cursor do item mais antigo (p_before);
 * 6. erro no bloco mostra o erro (nunca o vazio) e o "Tentar novamente" refaz só esta consulta.
 */

const h = vi.hoisted(() => ({
  calls: [] as Array<{ cursor: string | null; kind: string | null }>,
  primeiraPagina: [] as unknown[],
  segundaPagina: [] as unknown[],
  erro: null as Error | null,
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeChain = () => {
    let cursor: string | null = null;
    let kind: string | null = null;
    let registrado = false;
    const resolver = () => {
      if (!registrado) {
        registrado = true;
        h.calls.push({ cursor, kind });
      }
      if (h.erro) return Promise.resolve({ data: null, error: h.erro });
      return Promise.resolve({ data: cursor === null ? h.primeiraPagina : h.segundaPagina, error: null });
    };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.lt = (_col: string, value: string) => { cursor = value; return chain; };
    chain.in = (_col: string, values: string[]) => { kind = values[0] ?? null; return chain; };
    chain.then = (onFulfilled: (value: unknown) => unknown) => resolver().then(onFulfilled);
    return chain;
  };
  return {
    supabase: {
      from: () => makeChain(),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    },
  };
});

import { TalkXOperationalTimeline } from '../tracking/TalkXOperationalTimeline';

const BASE = Date.UTC(2026, 9, 8, 12, 0, 0);
/** 20 eventos, do mais novo para o mais antigo, um por minuto. */
const evento = (indice: number, over: Record<string, unknown> = {}) => ({
  id: `ev-${indice}`,
  campaign_id: 'camp-1',
  event_type: 'note',
  message: null,
  actor_id: null,
  entity_type: null,
  entity_id: null,
  created_at: new Date(BASE - indice * 60_000).toISOString(),
  actor: null,
  ...over,
});

const PRIMEIRA: unknown[] = [
  evento(0, { event_type: 'started' }),
  evento(1, { event_type: 'resumed', actor: { name: 'Ana Souza' } }),
  evento(2, {
    event_type: 'limits_updated',
    message: JSON.stringify({
      before: { max_per_minute: 30, business_hours_only: false },
      after: { max_per_minute: 60, business_hours_only: true },
    }),
  }),
  // resposta sem acesso à mensagem (RLS): só o título, sem trecho
  evento(3, { event_type: 'reply_received', message: null }),
  evento(4, { event_type: 'connection_failed', message: 'Falha de conexão (status: disconnected)' }),
  ...Array.from({ length: 15 }, (_, i) => evento(i + 5)),
];

function renderTimeline() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXOperationalTimeline campaignId="camp-1" />
    </QueryClientProvider>,
  );
}

const cardSection = () => screen.getByText('Linha do Tempo Operacional').closest('section') as HTMLElement;

beforeEach(() => {
  h.calls = [];
  h.erro = null;
  h.primeiraPagina = PRIMEIRA;
  h.segundaPagina = [
    evento(20, { event_type: 'completed' }),
    evento(21, { event_type: 'resumed_auto' }),
    evento(22, { event_type: 'cancelled' }),
  ];
});

describe('TalkXOperationalTimeline — leitura do servidor (X152)', () => {
  it('traduz os tipos: "resumed" com ator vira "Retomada após pausa" e o nome', async () => {
    renderTimeline();

    const section = await waitFor(() => cardSection());
    await waitFor(() => expect(within(section).getByText('Retomada após pausa')).toBeTruthy());
    expect(within(section).getByText('por Ana Souza')).toBeTruthy();
    expect(within(section).queryByText(/^resumed$/)).toBeNull();
    expect(section.textContent).not.toContain('resumed');
  });

  it('não mostra nenhuma chave do JSON de limits_updated', async () => {
    renderTimeline();

    const section = await waitFor(() => cardSection());
    await waitFor(() => expect(within(section).getByText('Limites alterados')).toBeTruthy());
    expect(within(section).getByText('Limite por minuto: 30 → 60 · Só horário comercial: Não → Sim')).toBeTruthy();
    expect(section.textContent).not.toContain('{');
    expect(section.textContent).not.toContain('limits_updated');
    expect(section.textContent).not.toContain('max_per_minute');
  });

  it('resposta sem acesso à mensagem fica só com o título (sem trecho)', async () => {
    renderTimeline();

    const section = await waitFor(() => cardSection());
    await waitFor(() => expect(within(section).getByText('Resposta recebida')).toBeTruthy());
    const linha = within(section).getByText('Resposta recebida').closest('li') as HTMLElement;
    expect(linha.textContent).toContain('Resposta recebida');
    expect(linha.textContent).not.toContain('“');
    expect(linha.querySelectorAll('p').length).toBe(1);
  });

  it('o card mostra 5 itens com o horário HH:mm e "Ver todos" abre o painel com o filtro por tipo', async () => {
    renderTimeline();

    const section = await waitFor(() => cardSection());
    await waitFor(() => expect(section.querySelectorAll('li').length).toBe(5));
    // Horário HH:mm à esquerda, no formato de hora do sistema.
    expect(within(section).getByText(fmtTime((PRIMEIRA[0] as { created_at: string }).created_at))).toBeTruthy();
    // o 6º evento (só "Observação") ficou de fora do card
    expect(within(section).queryByText('Observação')).toBeNull();

    fireEvent.click(within(section).getByRole('button', { name: /Ver todos/ }));

    const painel = await screen.findByRole('dialog');
    await waitFor(() => expect(painel.querySelectorAll('li').length).toBe(20));
    expect(within(painel).getByText('Todos os tipos')).toBeTruthy();
    expect(within(painel).getAllByText('Observação').length).toBe(15);
  });

  it('"Carregar mais" pede a segunda página pelo cursor do item mais antigo', async () => {
    renderTimeline();

    const section = await waitFor(() => cardSection());
    fireEvent.click(await within(section).findByRole('button', { name: /Ver todos/ }));
    const painel = await screen.findByRole('dialog');
    await waitFor(() => expect(painel.querySelectorAll('li').length).toBe(20));

    const maisAntigo = (PRIMEIRA[PRIMEIRA.length - 1] as { created_at: string }).created_at;
    expect(h.calls.some((c) => c.cursor === maisAntigo)).toBe(false);

    fireEvent.click(within(painel).getByRole('button', { name: /Carregar mais/ }));

    await waitFor(() => expect(h.calls.some((c) => c.cursor === maisAntigo)).toBe(true));
    await waitFor(() => expect(within(painel).getByText('Campanha concluída')).toBeTruthy());
    expect(within(painel).getAllByText('Retomada automática').length).toBeGreaterThan(0);
  });

  it('erro no bloco: mostra o erro (nunca o vazio) e o retry refaz só esta consulta', async () => {
    h.erro = new Error('falha exclusiva X152');
    renderTimeline();

    const section = await waitFor(() => cardSection());
    await waitFor(() => expect(within(section).getByText(/Não foi possível carregar/)).toBeTruthy());
    expect(within(section).queryByText('Nenhum evento registrado ainda.')).toBeNull();

    const antes = h.calls.length;
    fireEvent.click(within(section).getByRole('button', { name: /Tentar novamente/ }));

    await waitFor(() => expect(h.calls.length).toBeGreaterThan(antes));
    expect(h.calls[0].kind).toBeNull();
  });
});
