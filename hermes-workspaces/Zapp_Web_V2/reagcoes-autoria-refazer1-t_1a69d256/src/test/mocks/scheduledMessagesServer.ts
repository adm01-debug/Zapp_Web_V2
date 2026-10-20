/**
 * Servidor falso de `scheduled_messages` para os testes da Agenda (R2-MOD-029).
 *
 * Reproduz o comportamento do PostgREST que causa o defeito: um `select` SEM
 * `range` devolve só a PRIMEIRA página (o teto de linhas aplicado no projeto —
 * 1000). Como a consulta do hook ordena por `scheduled_at` CRESCENTE, um
 * histórico grande ocupa a página inteira e os agendamentos futuros nunca
 * chegam à tela. Com `range`, devolve a fatia pedida (limitada ao teto por
 * resposta), como o servidor de verdade.
 *
 * `queries` registra cada leitura feita (filtros, ordem e faixa) — é o que o
 * teste usa para afirmar O QUE foi pedido ao servidor, não só o que voltou.
 */

/** Teto de linhas por resposta do PostgREST no projeto (achados A6/A11). */
export const POSTGREST_PAGE = 1000;

export interface FakeScheduledMessageRow {
  id: string;
  contact_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  error_message: string | null;
  created_by: string | null;
  whatsapp_connection_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Linha completa a partir do que importa para o cenário. */
export function fakeScheduledMessage(
  over: Partial<FakeScheduledMessageRow> & { id: string; scheduled_at: string },
): FakeScheduledMessageRow {
  return {
    contact_id: 'c1',
    content: `mensagem ${over.id}`,
    message_type: 'text',
    media_url: null,
    status: 'pending',
    sent_at: null,
    error_message: null,
    created_by: null,
    whatsapp_connection_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/** Uma leitura que chegou ao servidor, como o teste a vê. */
export interface RecordedQuery {
  table: string;
  eq: Array<[string, unknown]>;
  gte: Array<[string, unknown]>;
  lte: Array<[string, unknown]>;
  order: string[];
  range: [number, number] | null;
}

export interface ScheduledMessagesServer {
  /** O `supabase.from` a ser injetado no mock do cliente. */
  from: (table: string) => unknown;
  /** Todas as leituras feitas, na ordem. */
  queries: RecordedQuery[];
}

export interface ScheduledMessagesServerOpts {
  /** Teto de linhas por resposta (default: `POSTGREST_PAGE`). */
  cap?: number;
  /** Quando presente, TODA leitura falha com este erro. */
  error?: { message: string };
}

export function createScheduledMessagesServer(
  rows: FakeScheduledMessageRow[],
  opts: ScheduledMessagesServerOpts = {},
): ScheduledMessagesServer {
  const cap = opts.cap ?? POSTGREST_PAGE;
  const queries: RecordedQuery[] = [];

  const from = (table: string): unknown => {
    const rec: RecordedQuery = { table, eq: [], gte: [], lte: [], order: [], range: null };
    queries.push(rec);

    const valor = (row: FakeScheduledMessageRow, coluna: string): string =>
      String((row as unknown as Record<string, unknown>)[coluna] ?? '');

    const ler = (): FakeScheduledMessageRow[] => {
      let out = rows.filter((r) => rec.eq.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v));
      out = out.filter((r) => rec.gte.every(([c, v]) => valor(r, c) >= String(v)));
      out = out.filter((r) => rec.lte.every(([c, v]) => valor(r, c) <= String(v)));

      const ordem = [...rec.order];
      out = [...out].sort((a, b) => {
        for (const o of ordem) {
          const [coluna, direcao] = o.split(':');
          const av = valor(a, coluna);
          const bv = valor(b, coluna);
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          if (cmp !== 0) return direcao === 'desc' ? -cmp : cmp;
        }
        return 0;
      });

      const inicio = rec.range ? rec.range[0] : 0;
      const fim = rec.range ? rec.range[1] : cap - 1;
      return out.slice(inicio, Math.min(fim + 1, inicio + cap));
    };

    const builder = {
      select: () => builder,
      eq: (coluna: string, v: unknown) => {
        rec.eq.push([coluna, v]);
        return builder;
      },
      gte: (coluna: string, v: unknown) => {
        rec.gte.push([coluna, v]);
        return builder;
      },
      lte: (coluna: string, v: unknown) => {
        rec.lte.push([coluna, v]);
        return builder;
      },
      order: (coluna: string, o?: { ascending?: boolean }) => {
        rec.order.push(`${coluna}:${o?.ascending === false ? 'desc' : 'asc'}`);
        return builder;
      },
      range: (inicio: number, fim: number) => {
        rec.range = [inicio, fim];
        return builder;
      },
      then: (
        onFulfilled?: ((v: { data: FakeScheduledMessageRow[] | null; error: { message: string } | null }) => unknown) | null,
        onRejected?: ((e: unknown) => unknown) | null,
      ) =>
        Promise.resolve(
          opts.error ? { data: null, error: opts.error } : { data: ler(), error: null },
        ).then(onFulfilled, onRejected),
    };

    return builder;
  };

  return { from, queries };
}
