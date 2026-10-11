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
  /**
   * Aplica de verdade o cursor composto que a tela envia ao `.or()`:
   * `created_at.lt.<c>,and(created_at.eq.<c>,id.lt.<id>)`. Assim o teste prova que um
   * evento com o `created_at` empatado na borda da página só aparece se o filtro
   * desempatar por `id` — um cursor só de `created_at` o perde.
   */
  const aplicarCursor = (dados: Record<string, unknown>[], orFilter: string) => {
    const m = orFilter.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.(.+)\)$/);
    if (!m) return [];
    const [, limiteAt, atIgual, idLimite] = m;
    return dados
      .filter((row) => {
        const at = String(row.created_at);
        const id = String(row.id);
        return at < limiteAt || (at === atIgual && id < idLimite);
      })
      .sort((a, b) => {
        const porAt = String(b.created_at).localeCompare(String(a.created_at));
        return porAt !== 0 ? porAt : String(b.id).localeCompare(String(a.id));
      });
  };

  const makeChain = () => {
    let orFilter: string | null = null;
    let kind: string | null = null;
    let limit = 20;
    let registrado = false;
    const resolver = () => {
      if (!registrado) {
        registrado = true;
        h.calls.push({ cursor: orFilter, kind });
      }
      if (h.erro) return Promise.resolve({ data: null, error: h.erro });
      if (orFilter === null) {
        return Promise.resolve({ data: h.primeiraPagina.slice(0, limit), error: null });
      }
      const candidatos = [...h.primeiraPagina, ...h.segundaPagina] as Record<string, unknown>[];
      return Promise.resolve({ data: aplicarCursor(candidatos, orFilter).slice(0, limit), error: null });
    };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = (n: number) => { limit = n; return chain; };
    chain.in = (_col: string, values: string[]) => { kind = values[0] ?? null; return chain; };
    chain.or = (filter: string) => { orFilter = filter; return chain; };
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
  // evento sem mensagem: só o título, sem trecho
  evento(3, { event_type: 'created', message: null }),
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

  it('evento sem mensagem fica só com o título (sem trecho)', async () => {
    renderTimeline();

    const section = await waitFor(() => cardSection());
    await waitFor(() => expect(within(section).getByText('Campanha criada')).toBeTruthy());
    const linha = within(section).getByText('Campanha criada').closest('li') as HTMLElement;
    expect(linha.textContent).toContain('Campanha criada');
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

  it('"Carregar mais" pede a segunda página pelo cursor compound do item mais antigo', async () => {
    renderTimeline();

    const section = await waitFor(() => cardSection());
    fireEvent.click(await within(section).findByRole('button', { name: /Ver todos/ }));
    const painel = await screen.findByRole('dialog');
    await waitFor(() => expect(painel.querySelectorAll('li').length).toBe(20));

    // Primeira carga não usa cursor (sem .or()).
    expect(h.calls.some((c) => c.cursor && c.cursor.startsWith('created_at.lt.'))).toBe(false);

    fireEvent.click(within(painel).getByRole('button', { name: /Carregar mais/ }));

    // Segunda carga usa cursor compound via .or().
    await waitFor(() => expect(h.calls.some((c) => c.cursor && c.cursor.startsWith('created_at.lt.'))).toBe(true));
    await waitFor(() => expect(within(painel).getByText('Campanha concluída')).toBeTruthy());
    expect(within(painel).getAllByText('Retomada automática').length).toBeGreaterThan(0);
  });

  it('cursor compound desempata por id: o evento empatado na borda da página não se perde', async () => {
    const mesmoCreatedAt = new Date(BASE - 5 * 60_000).toISOString();
    // 21 itens com o MESMO created_at e ids distintos: a página 1 traz ev-20..ev-01 e o
    // item empatado ev-00 fica logo depois da borda. Só o cursor (created_at, id) o alcança.
    h.primeiraPagina = Array.from({ length: 20 }, (_, i) =>
      evento(i, {
        event_type: i === 0 ? 'started' : 'note',
        created_at: mesmoCreatedAt,
        id: `ev-${String(20 - i).padStart(2, '0')}`, // ev-20 … ev-01
      }),
    );
    h.segundaPagina = [evento(20, { event_type: 'completed', created_at: mesmoCreatedAt, id: 'ev-00' })];

    renderTimeline();

    const section = await waitFor(() => cardSection());
    await waitFor(() => expect(section.querySelectorAll('li').length).toBe(5));

    fireEvent.click(await within(section).findByRole('button', { name: /Ver todos/ }));
    const painel = await screen.findByRole('dialog');
    await waitFor(() => expect(painel.querySelectorAll('li').length).toBe(20));

    // A primeira carga não usa cursor.
    expect(h.calls.some((c) => c.cursor !== null)).toBe(false);

    fireEvent.click(within(painel).getByRole('button', { name: /Carregar mais/ }));

    // O filtro INTEIRO vai ao .or(): created_at.lt + o ramo and(created_at.eq, id.lt.ev-01),
    // onde ev-01 é o último item (o de menor id) da página 1.
    const esperado = `created_at.lt.${mesmoCreatedAt},and(created_at.eq.${mesmoCreatedAt},id.lt.ev-01)`;
    await waitFor(() => expect(h.calls.some((c) => c.cursor === esperado)).toBe(true));

    // O mock aplica esse filtro sobre os dados: o empatado ev-00 só aparece porque o id
    // desempata. Com um cursor só de created_at, 'Carregar mais' não traria nada.
    await waitFor(() => expect(within(painel).getByText('Campanha concluída')).toBeTruthy());
    expect(painel.querySelectorAll('li').length).toBe(21);
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
