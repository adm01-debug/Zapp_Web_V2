/**
 * R2-INB-020 / item 316 — filtro por tag na busca global: contatos cortados pelo
 * LIMIT antes do filtro e mensagens/transcrições fora do escopo da tag.
 *
 * Contrato do achado (evidência estática em `useGlobalSearchData.ts:108-186`):
 *  - a consulta de contatos aplicava `.limit(10)` e só DEPOIS filtrava a tag em
 *    JS; quando o contato marcado é o 11º da ordem alfabética, a busca devolve
 *    zero contatos apesar de haver casamento;
 *  - as consultas de mensagem e transcrição não aplicavam as tags selecionadas,
 *    então o chip de tag não representava um escopo comum (mensagens de contatos
 *    fora da tag apareciam).
 *
 * O banco falso abaixo emula o PostgREST no ponto que importa: os filtros são
 * aplicados ANTES do LIMIT, como o servidor faz. Vermelho antes: o contato
 * marcado (11º alfabético) não aparece e a mensagem de contato sem a tag
 * aparece. Verde depois: o filtro entra na consulta, antes do LIMIT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlobalSearch } from '@/components/inbox/GlobalSearch';

type Row = Record<string, unknown>;

interface Query {
  table: string;
  filters: Array<(row: Row) => boolean>;
  order: [string, boolean] | null;
  limit: number;
  selectIdOnly: boolean;
}

/** `name.ilike."%mensagem%",surname.ilike."%mensagem%",...` (saída de `.or()`). */
function parseOr(orString: string): Array<{ column: string; needle: string }> {
  return orString.split(',').map((part) => {
    const [, column, raw] = part.match(/^([^.]+)\.ilike\.(.*)$/) ?? [];
    const value = String(raw ?? '').replace(/^"|"$/g, '').replace(/%/g, '');
    return { column: column ?? '', needle: value.toLowerCase() };
  });
}

const { supabaseMock } = vi.hoisted(() => {
  // O contato marcado é o 11º na ordem alfabética (depois dos 10 "Ana NN").
  const CONTATO_MARCADO: Row = {
    id: 'c-vip', name: 'Zara', surname: 'Vip', phone: '+5511900000000',
    email: null, created_at: '2026-10-01T09:00:00.000Z', tags: ['VIP'], is_lid_legacy: false,
  };
  const CONTATOS_COMUNS: Row[] = Array.from({ length: 10 }, (_, i) => ({
    id: `c-${i + 1}`, name: `Ana ${String(i + 1).padStart(2, '0')}`, surname: null,
    phone: `+551190000000${i}`, email: null, created_at: '2026-09-01T09:00:00.000Z',
    tags: [], is_lid_legacy: false,
  }));

  const MENSAGENS: Row[] = [
    { id: 'm-vip', content: 'mensagem do time', message_type: 'text', created_at: '2026-10-05T12:00:00.000Z', contact_id: 'c-vip', transcription: null, contacts: { id: 'c-vip', name: 'Zara', surname: 'Vip' } },
    { id: 'm-fora', content: 'mensagem do time', message_type: 'text', created_at: '2026-10-05T11:00:00.000Z', contact_id: 'c-1', transcription: null, contacts: { id: 'c-1', name: 'Ana 01', surname: null } },
    { id: 'a-vip', content: '[áudio]', message_type: 'audio', created_at: '2026-10-05T10:00:00.000Z', contact_id: 'c-vip', transcription: 'reuniao com o cliente', contacts: { id: 'c-vip', name: 'Zara', surname: 'Vip' } },
    { id: 'a-fora', content: '[áudio]', message_type: 'audio', created_at: '2026-10-05T09:00:00.000Z', contact_id: 'c-1', transcription: 'reuniao interna', contacts: { id: 'c-1', name: 'Ana 01', surname: null } },
  ];

  function execute(query: Query): Row[] {
    const source = query.table === 'contacts' ? [...CONTATOS_COMUNS, CONTATO_MARCADO] : MENSAGENS;
    let rows = source.filter((row) => query.filters.every((predicate) => predicate(row)));
    if (query.order) {
      const [column, ascending] = query.order;
      rows = [...rows].sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (ascending ? 1 : -1));
    }
    // LIMIT aplicado no fim, como no PostgREST (filtro antes, corte depois).
    rows = rows.slice(0, query.limit);
    return query.selectIdOnly ? rows.map((row) => ({ id: row.id })) : rows;
  }

  function builder(query: Query): unknown {
    return new Proxy({} as Record<string, unknown>, {
      get(_target, property: string) {
        if (property === 'then') {
          return (resolve: (value: unknown) => unknown) => resolve({ data: execute(query), error: null });
        }
        return (...args: unknown[]) => {
          switch (property) {
            case 'select': query.selectIdOnly = String(args[0]).trim() === 'id'; break;
            case 'eq': query.filters.push((row) => row[String(args[0])] === args[1]); break;
            case 'not':
              if (args[1] === 'is' && args[2] === null) query.filters.push((row) => row[String(args[0])] != null);
              break;
            case 'or':
              query.filters.push((row) => parseOr(String(args[0])).some(({ column, needle }) =>
                String(row[column] ?? '').toLowerCase().includes(needle)));
              break;
            case 'ilike':
              query.filters.push((row) => String(row[String(args[0])] ?? '')
                .toLowerCase().includes(String(args[1]).replace(/%/g, '').toLowerCase()));
              break;
            case 'in':
              query.filters.push((row) => (args[1] as unknown[]).includes(row[String(args[0])]));
              break;
            case 'overlaps':
              query.filters.push((row) => Array.isArray(row[String(args[0])])
                && (row[String(args[0])] as unknown[]).some((value) => (args[1] as unknown[]).includes(value)));
              break;
            case 'gte':
              query.filters.push((row) => new Date(String(row[String(args[0])])).getTime() >= new Date(String(args[1])).getTime());
              break;
            case 'order': query.order = [String(args[0]), (args[1] as { ascending?: boolean } | undefined)?.ascending !== false]; break;
            case 'limit': query.limit = Number(args[0]); break;
            default: break;
          }
          return builder(query);
        };
      },
    });
  }

  return {
    supabaseMock: {
      from: (table: string) => builder({ table, filters: [], order: null, limit: Infinity, selectIdOnly: false }),
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/logger', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { log: logger, getLogger: () => logger };
});
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: false, roles: [] }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));

function renderBusca() {
  render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);
  return screen.getByPlaceholderText(/Buscar mensagens/i);
}

/** Digita o termo com `#` e seleciona a tag VIP na sugestão. */
async function buscarComTagVip(input: HTMLElement, termo: string) {
  fireEvent.change(input, { target: { value: `${termo}#v` } });
  const sugestao = await screen.findByRole('button', { name: 'VIP' });
  fireEvent.click(sugestao);
}

describe('R2-INB-020 — filtro por tag na busca global', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('acha o contato marcado mesmo quando ele é o 11º da ordem alfabética', async () => {
    const input = renderBusca();

    await buscarComTagVip(input, '');

    // Sem a correção o LIMIT de 10 cortava a lista antes do filtro de tag e a
    // busca devolvia zero contatos, apesar de 'Zara Vip' ter a tag VIP.
    expect(await screen.findByText('Zara Vip')).toBeInTheDocument();
  });

  it('limita as mensagens aos contatos que carregam a tag', async () => {
    const input = renderBusca();

    await buscarComTagVip(input, 'mensagem ');

    // Só a mensagem do contato marcado entra no escopo: 1 resultado, não 2.
    await waitFor(() => expect(screen.getByText('1 resultado')).toBeInTheDocument());
    expect(screen.getByText('Conversa com Zara Vip')).toBeInTheDocument();
    expect(screen.queryByText('Conversa com Ana 01')).not.toBeInTheDocument();
  });

  it('limita as transcrições aos contatos que carregam a tag', async () => {
    const input = renderBusca();

    await buscarComTagVip(input, 'reuniao ');

    await waitFor(() => expect(screen.getByText('1 resultado')).toBeInTheDocument());
    expect(screen.getByText('Áudio de Zara Vip')).toBeInTheDocument();
    expect(screen.queryByText('Áudio de Ana 01')).not.toBeInTheDocument();
  });
});
